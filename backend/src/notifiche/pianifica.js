'use strict';

const calendario = require('./calendario');
const trasporto = require('./trasporto');
const { DEVICE, duplicato, utilizzabile } = require('./dispositivi');

const CONSEGNA = 'api::notifica-consegna.notifica-consegna';
const TRANSAZIONI = 'api::transazioni.transazioni';
const CATEGORIE = 'api::categorie.categorie';

function evento(tipo, ref, periodo, dettagli) {
  return { tipo, tag: trasporto.sha(`${tipo}:${ref}:${periodo}`).slice(0, 32), ...dettagli };
}

async function scadenze(strapi, utente, data, anticipo) {
  const giorno = calendario.aggiungiGiorni(data, anticipo);
  const templates = await strapi.db.query(TRANSAZIONI).findMany({
    where: { TransazioneRicorrente: true, categorie: { wallet: { users_permissions_user: utente } } },
    select: ['documentId', 'Data', 'RicorrenzaTemporale'],
  });
  return templates.filter((t) => calendario.scadeIl(t, giorno))
    .map((t) => evento('scadenza', t.documentId, giorno.slice(0, 7), { riferimento: t.documentId, giorno }));
}

async function sforamenti(strapi, utente, data) {
  const { mese, inizio, fine } = calendario.meseDi(data);
  const categorie = await strapi.db.query(CATEGORIE).findMany({
    where: {
      Budget_categoria: { $gt: 0 },
      wallet: { $and: [
        { users_permissions_user: utente },
        { $or: [{ escludiDaStatistiche: false }, { escludiDaStatistiche: null }] },
      ] },
    },
    select: ['id', 'documentId', 'Budget_categoria'],
    populate: { wallet: { select: ['documentId'] } },
  });
  if (!categorie.length) return [];

  const transazioni = await strapi.db.query(TRANSAZIONI).findMany({
    where: { Data: { $between: [inizio, fine] }, categorie: { id: { $in: categorie.map((c) => c.id) } } },
    select: ['Importo'],
    populate: { categorie: { select: ['id'] } },
  });
  const centesimi = (valore) => Math.round(Number(valore) * 100);
  const totali = new Map();
  for (const t of transazioni) {
    const id = t.categorie?.id;
    totali.set(id, (totali.get(id) ?? 0) + centesimi(t.Importo));
  }

  return categorie.filter((c) => (totali.get(c.id) ?? 0) > centesimi(c.Budget_categoria))
    .map((c) => evento('budget', c.documentId, mese, {
      riferimento: c.documentId, portafoglio: c.wallet.documentId, mese,
    }));
}

async function consegna(strapi, dispositivo, avviso, scadeIl, vapid) {
  const repo = strapi.db.query(CONSEGNA);
  const chiave = trasporto.sha(`${dispositivo.utente.id}:${dispositivo.idBrowser}:${avviso.tag}`);
  if (await repo.findOne({ where: { chiave }, select: ['id'] })) return;
  if (!await strapi.db.query(DEVICE).findOne({ where: { id: dispositivo.id, utente: dispositivo.utente.id }, select: ['id'] })) return;
  try {
    await repo.create({ data: { chiave, scadeIl } });
  } catch (err) {
    if (duplicato(err)) return;
    throw err;
  }

  try {
    await trasporto.invia(dispositivo, avviso, vapid);
  } catch (err) {
    if (trasporto.rispostaDefinitiva(err)) {
      await strapi.db.query(DEVICE).delete({ where: { id: dispositivo.id } });
      return;
    }
    // Una mancata accettazione dal servizio push può essere ritentata.
    await repo.deleteMany({ where: { chiave } });
    strapi.log.warn('Notifiche Budget App: invio non riuscito, sarà ritentato.');
  }
}

async function elabora(strapi, now = new Date()) {
  const vapid = trasporto.configurazione();
  if (!vapid) return;
  const { data, orario } = calendario.oraLocale(now);
  const database = strapi.db.query(DEVICE);
  const devices = await database.findMany({
    where: { chiavePubblica: vapid.publicKey, utente: { blocked: false, confirmed: true } },
    populate: { utente: { select: ['id', 'orarioNotifiche', 'orarioNotificheWeb', 'anticipoNotifiche', 'avvisiBudget'] } },
  });
  const perUtente = new Map();
  for (const dispositivo of devices) {
    if (!dispositivo.utente || !utilizzabile(dispositivo, vapid, +now)) continue;
    const id = dispositivo.utente.id;
    if (!perUtente.has(id)) perUtente.set(id, []);
    perUtente.get(id).push(dispositivo);
  }

  const conservareFino = calendario.aggiungiGiorni(data, 62);
  for (const [utente, dispositivi] of perUtente) {
    const p = calendario.preferenze(dispositivi[0].utente);
    const avvisi = p.scadenze != null && orario >= p.orario ? await scadenze(strapi, utente, data, p.scadenze) : [];
    if (p.budget) avvisi.push(...await sforamenti(strapi, utente, data));
    for (const avviso of avvisi) {
      await Promise.all(dispositivi.map((d) => consegna(strapi, d, avviso, conservareFino, vapid)));
    }
  }
}

function registraCron(strapi) {
  let inCorso = false;
  strapi.cron.add({
    notificheBudget: {
      options: { rule: '* * * * *' },
      async task() {
        if (inCorso) return;
        inCorso = true;
        try {
          await elabora(strapi);
        } catch {
          strapi.log.error('Notifiche Budget App: controllo delle scadenze non riuscito.');
        } finally {
          inCorso = false;
        }
      },
    },
    pulisciNotificheBudget: {
      options: { rule: '15 3 * * *', tz: calendario.fuso },
      async task() {
        await strapi.db.query(CONSEGNA).deleteMany({
          where: { scadeIl: { $lt: calendario.oraLocale(new Date()).data } },
        });
      },
    },
  });
}

module.exports = { elabora, registraCron };
