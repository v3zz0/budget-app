'use strict';

// Salvadanaio a cartelle (progetto.md §4.3 e §5).
//
//   cartella standard "Risparmi mensili" (una per wallet, non eliminabile):
//     un movimento per mese col risparmio (Mese = "AAAA-MM", Importo >= 0) e
//     gli spostamenti verso i salvadanai personali (stesso Mese, Importo < 0).
//     Disponibile di un mese = somma dei suoi movimenti.
//   salvadanai personali: versamenti (+) e prelievi (-). Un versamento "da
//     Risparmi mensili" ha Provenienza = il movimento negativo del mese.
//
// Regola: nessun saldo sotto zero (cartella personale, singolo mese), verificata
// QUI, sul server, dentro la stessa transazione della scrittura.
//
// ponytail: il controllo del saldo è "leggi e poi scrivi" in una transazione;
//   due prelievi simultanei sullo stesso salvadanaio in MySQL REPEATABLE READ
//   potrebbero passare entrambi. Con un utente (o due) che usano l'app a mano
//   non succede; servisse, un SELECT ... FOR UPDATE sulla cartella.

const CARTELLA = 'api::cartella.cartella';
const MOV = 'api::movimento-salvadanaio.movimento-salvadanaio';
const VECCHIO = 'api::salvadanaio.salvadanaio';
const WALLET = 'api::wallet.wallet';
const TRANSAZIONE = 'api::transazioni.transazioni';
const CATEGORIA = 'api::categorie.categorie';

const pad = (n) => String(n).padStart(2, '0');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const oggiIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const meseDi = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const MESE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class Errore extends Error {
  constructor(messaggio, status = 400) {
    super(messaggio);
    this.status = status;
  }
}

/** La cartella standard del wallet (id interno), creata se manca. */
async function assicuraStandard(strapi, walletId) {
  const q = strapi.db.query(CARTELLA);
  const c = await q.findOne({ where: { Standard: true, wallet: { id: walletId } } });
  if (c) return c;
  return q.create({ data: { Nome: 'Risparmi mensili', Standard: true, Colore: 'pietra', wallet: walletId } });
}

const movimentiDi = (strapi, cartellaIds) =>
  strapi.db.query(MOV).findMany({
    where: { salvadanaio: { id: { $in: cartellaIds } } },
    populate: { salvadanaio: { select: ['id'] }, Provenienza: { select: ['id', 'Mese'] } },
    orderBy: [{ Data: 'desc' }, { id: 'desc' }],
  });

/** Entrate − uscite di un wallet in un mese "AAAA-MM": il suggerimento del risparmio. */
async function entrateMenoUscite(strapi, walletId, mese) {
  const [a, m] = mese.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const righe = await strapi.db.query(TRANSAZIONE).findMany({
    where: { Data: { $gte: `${mese}-01`, $lte: `${mese}-${pad(ultimo)}` }, categorie: { wallet: { id: walletId } } },
    // `id` nel select: con un filtro su una relazione db.query fa DISTINCT e
    // due righe uguali (stesso importo) diventerebbero una sola nella somma
    select: ['id', 'Importo'],
    populate: { categorie: { select: ['Tipo'] } },
  });
  let s = 0;
  for (const t of righe) {
    const tipo = t.categorie?.Tipo || 'uscita';
    if (tipo === 'entrata') s += Number(t.Importo) || 0;
    else if (tipo === 'uscita') s -= Number(t.Importo) || 0;
  }
  return r2(s);
}

/** Tutto quello che serve alla pagina, per un wallet (id interno). */
async function stato(strapi, wallet) {
  const standard = await assicuraStandard(strapi, wallet.id);
  const cartelle = await strapi.db.query(CARTELLA).findMany({ where: { wallet: { id: wallet.id } }, orderBy: [{ Standard: 'desc' }, { id: 'asc' }] });
  const movimenti = await movimentiDi(strapi, cartelle.map((c) => c.id));
  const nomi = new Map(cartelle.map((c) => [c.id, c.Nome]));
  const mesi = new Map(); // "AAAA-MM" -> { mese, risparmio, disponibile, spostati: [{importo, verso}] }
  const perCartella = new Map(cartelle.map((c) => [c.id, []]));
  const verso = new Map(); // id movimento negativo del mese -> nome del salvadanaio che l'ha ricevuto
  for (const m of movimenti) if (m.Provenienza) verso.set(m.Provenienza.id, nomi.get(m.salvadanaio?.id));

  for (const m of movimenti) {
    const importo = r2(m.Importo);
    const cid = m.salvadanaio?.id;
    if (cid === standard.id && m.Mese) {
      const x = mesi.get(m.Mese) || { mese: m.Mese, risparmio: 0, disponibile: 0, spostati: [] };
      x.disponibile = r2(x.disponibile + importo);
      if (importo >= 0) x.risparmio = r2(x.risparmio + importo);
      else x.spostati.push({ id: m.documentId, importo: -importo, verso: verso.get(m.id) || 'salvadanaio eliminato' });
      mesi.set(m.Mese, x);
    }
    perCartella.get(cid)?.push({
      id: m.documentId, importo, data: m.Data, nota: m.Nota || '', mese: m.Mese || null, chi: m.Chi || null,
      daMese: m.Provenienza?.Mese || null,
    });
  }

  // Versamenti automatici (§16): template ricorrenti legati a una cartella
  const automatici = await strapi.db.query(TRANSAZIONE).findMany({
    where: { TransazioneRicorrente: true, salvadanaio: { id: { $in: cartelle.map((c) => c.id) } } },
    select: ['documentId', 'Importo', 'Data', 'RicorrenzaTemporale', 'InPausa', 'fonte', 'Descrizione'],
    populate: { salvadanaio: { select: ['id'] } },
  });
  const autoPer = new Map();
  for (const t of automatici) {
    const id = t.salvadanaio?.id;
    if (!autoPer.has(id)) autoPer.set(id, []);
    autoPer.get(id).push({
      id: t.documentId, importo: r2(t.Importo), giorno: Number(String(t.RicorrenzaTemporale || t.Data).slice(8, 10)),
      inPausa: !!t.InPausa, fonte: t.fonte || 'nuovi', inizio: t.Data,
    });
  }

  const meseCorrente = meseDi();
  return {
    meseCorrente,
    suggerito: await entrateMenoUscite(strapi, wallet.id, meseCorrente),
    mesi: [...mesi.values()].sort((a, b) => b.mese.localeCompare(a.mese)),
    cartelle: cartelle.map((c) => {
      const movs = perCartella.get(c.id) || [];
      return {
        id: c.documentId, nome: c.Nome, emoji: c.Emoji || '', colore: c.Colore || 'pietra',
        obiettivo: c.Obiettivo == null ? null : r2(c.Obiettivo), standard: !!c.Standard,
        saldo: r2(movs.reduce((s, m) => s + m.importo, 0)),
        movimenti: c.Standard ? [] : movs,
        automatici: autoPer.get(c.id) || [],
      };
    }),
  };
}

const cartellaDelWallet = async (strapi, documentId, walletId) => {
  const c = await strapi.db.query(CARTELLA).findOne({ where: { documentId, wallet: { id: walletId } } });
  if (!c) throw new Errore('Salvadanaio non trovato', 404);
  return c;
};
const saldoCartella = async (strapi, cartellaId) =>
  r2((await strapi.db.query(MOV).findMany({ where: { salvadanaio: { id: cartellaId } }, select: ['id', 'Importo'] })).reduce((s, m) => s + Number(m.Importo), 0));
const disponibileMese = async (strapi, standardId, mese) =>
  r2((await strapi.db.query(MOV).findMany({ where: { salvadanaio: { id: standardId }, Mese: mese }, select: ['id', 'Importo'] })).reduce((s, m) => s + Number(m.Importo), 0));

function importoValido(v) {
  const n = r2(v);
  if (!(n > 0) || n > 1e9) throw new Errore('Inserisci un importo maggiore di zero');
  return n;
}

async function creaCartella(strapi, wallet, { nome, emoji, colore, obiettivo }) {
  const n = String(nome || '').trim();
  if (n.length < 2) throw new Errore('Scrivi un nome di almeno 2 caratteri');
  const c = await strapi.db.query(CARTELLA).create({
    data: {
      Nome: n.slice(0, 40), Emoji: String(emoji || '').slice(0, 16), Standard: false, wallet: wallet.id,
      Colore: ['argilla', 'nebbia', 'kaki', 'pietra', 'lilla'].includes(colore) ? colore : 'pietra',
      Obiettivo: obiettivo > 0 ? r2(obiettivo) : null,
    },
  });
  return c.documentId;
}

async function modificaCartella(strapi, wallet, documentId, { nome, emoji, colore, obiettivo }) {
  const c = await cartellaDelWallet(strapi, documentId, wallet.id);
  if (c.Standard) throw new Errore('“Risparmi mensili” non si modifica');
  const data = {};
  if (nome !== undefined) {
    if (String(nome).trim().length < 2) throw new Errore('Scrivi un nome di almeno 2 caratteri');
    data.Nome = String(nome).trim().slice(0, 40);
  }
  if (emoji !== undefined) data.Emoji = String(emoji).slice(0, 16);
  if (colore !== undefined && ['argilla', 'nebbia', 'kaki', 'pietra', 'lilla'].includes(colore)) data.Colore = colore;
  if (obiettivo !== undefined) data.Obiettivo = obiettivo > 0 ? r2(obiettivo) : null;
  await strapi.db.query(CARTELLA).update({ where: { id: c.id }, data });
}

/**
 * Elimina un salvadanaio personale. I soldi arrivati dai Risparmi mensili
 * tornano nei loro mesi (si tolgono anche i movimenti negativi collegati).
 */
async function eliminaCartella(strapi, wallet, documentId) {
  const c = await cartellaDelWallet(strapi, documentId, wallet.id);
  if (c.Standard) throw new Errore('“Risparmi mensili” non si può eliminare');
  await strapi.db.transaction(async () => {
    const movs = await strapi.db.query(MOV).findMany({ where: { salvadanaio: { id: c.id } }, populate: { Provenienza: { select: ['id'] } } });
    const collegati = movs.map((m) => m.Provenienza?.id).filter(Boolean);
    const ids = [...movs.map((m) => m.id), ...collegati];
    if (ids.length) await strapi.db.query(MOV).deleteMany({ where: { id: { $in: ids } } });
    // i versamenti automatici verso questo salvadanaio non hanno più senso
    await strapi.db.query(TRANSAZIONE).deleteMany({ where: { salvadanaio: { id: c.id } } });
    await strapi.db.query(CARTELLA).delete({ where: { id: c.id } });
  });
}

/**
 * Versa (importo > 0) o preleva (importo < 0) in un salvadanaio personale.
 * daMese = "AAAA-MM": i soldi arrivano dai Risparmi mensili di quel mese
 * (due movimenti, stessa transazione); il totale del wallet non cambia.
 */
async function movimento(strapi, wallet, documentId, { importo, nota, daMese, data, chi, ricorrenza }, mioRuolo = null) {
  const c = await cartellaDelWallet(strapi, documentId, wallet.id);
  if (c.Standard) throw new Errore('Nei Risparmi mensili si imposta il risparmio del mese');
  const segno = Number(importo) < 0 ? -1 : 1;
  const valore = importoValido(Math.abs(Number(importo)));
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : oggiIso();
  const testo = String(nota || '').trim().slice(0, 120);
  if (daMese && segno < 0) throw new Errore('Dai Risparmi mensili si può solo versare');
  if (daMese && !MESE_RE.test(daMese)) throw new Errore('Mese non valido');

  return strapi.db.transaction(async () => {
    if (segno < 0) {
      const saldo = await saldoCartella(strapi, c.id);
      if (valore > saldo) throw new Errore(`Nel salvadanaio ci sono solo €${saldo.toFixed(2).replace('.', ',')}: non puoi prelevarne di più`);
    }
    let provenienza = null;
    if (daMese) {
      const standard = await assicuraStandard(strapi, wallet.id);
      const disp = await disponibileMese(strapi, standard.id, daMese);
      if (valore > disp) throw new Errore(`In quel mese sono disponibili solo €${Math.max(0, disp).toFixed(2).replace('.', ',')}`);
      provenienza = await strapi.db.query(MOV).create({
        data: { Importo: -valore, Data: giorno, Mese: daMese, Nota: `→ ${c.Nome}`, salvadanaio: standard.id },
      });
    }
    // Condiviso: chi ha versato o prelevato (default: chi registra)
    const Chi = wallet.condiviso ? (['creatore', 'membro'].includes(chi) ? chi : mioRuolo || 'creatore') : null;
    const m = await strapi.db.query(MOV).create({
      data: {
        Importo: segno * valore, Data: giorno, Nota: testo, Chi, salvadanaio: c.id,
        ...(provenienza && { Provenienza: provenienza.id }),
        ...(ricorrenza && { ricorrenza }), // versamento automatico (§16): anti-doppione del cron
      },
    });
    return m.documentId;
  });
}

/** Annulla un movimento di un salvadanaio personale (e lo spostamento collegato). */
async function eliminaMovimento(strapi, wallet, documentId) {
  const m = await strapi.db.query(MOV).findOne({
    where: { documentId, salvadanaio: { wallet: { id: wallet.id } } },
    populate: { salvadanaio: true, Provenienza: { select: ['id'] } },
  });
  if (!m || m.salvadanaio.Standard) throw new Errore('Movimento non trovato', 404);
  await strapi.db.transaction(async () => {
    if (Number(m.Importo) > 0) {
      const saldo = await saldoCartella(strapi, m.salvadanaio.id);
      if (saldo - Number(m.Importo) < -0.004) throw new Errore('Annullandolo il saldo andrebbe sotto zero: prima annulla i prelievi');
    }
    const ids = [m.id, m.Provenienza?.id].filter(Boolean);
    await strapi.db.query(MOV).deleteMany({ where: { id: { $in: ids } } });
  });
}

/**
 * Risparmio di un mese (Risparmi mensili): sostituisce il valore inserito.
 * Non può scendere sotto quanto già spostato da quel mese.
 */
async function impostaRisparmio(strapi, wallet, mese, importo) {
  if (!MESE_RE.test(mese || '')) throw new Errore('Mese non valido');
  if (mese > meseDi()) throw new Errore('Non si può risparmiare in un mese che non è ancora iniziato');
  const valore = r2(importo);
  if (!(valore >= 0) || valore > 1e9) throw new Errore('Inserisci un importo valido');
  const standard = await assicuraStandard(strapi, wallet.id);
  return strapi.db.transaction(async () => {
    const del = await strapi.db.query(MOV).findMany({ where: { salvadanaio: { id: standard.id }, Mese: mese } });
    const spostati = r2(-del.filter((m) => Number(m.Importo) < 0).reduce((s, m) => s + Number(m.Importo), 0));
    if (valore < spostati) throw new Errore(`Da questo mese hai già spostato €${spostati.toFixed(2).replace('.', ',')}: il risparmio non può essere più basso`);
    const positivi = del.filter((m) => Number(m.Importo) >= 0);
    if (positivi.length) {
      await strapi.db.query(MOV).update({ where: { id: positivi[0].id }, data: { Importo: valore } });
      if (positivi.length > 1) await strapi.db.query(MOV).deleteMany({ where: { id: { $in: positivi.slice(1).map((m) => m.id) } } });
    } else {
      await strapi.db.query(MOV).create({ data: { Importo: valore, Data: `${mese}-01`, Mese: mese, salvadanaio: standard.id } });
    }
  });
}

/**
 * Cron di fine mese: chiude il mese per ogni wallet. Se l'utente non ha
 * inserito il risparmio, vale entrate − uscite (se positivo).
 */
async function chiudiMese(strapi, mese) {
  const wallets = await strapi.db.query(WALLET).findMany({ select: ['id', 'Nome'] });
  for (const w of wallets) {
    const standard = await assicuraStandard(strapi, w.id);
    const esiste = await strapi.db.query(MOV).count({ where: { salvadanaio: { id: standard.id }, Mese: mese, Importo: { $gte: 0 } } });
    if (esiste) continue;
    const suggerito = await entrateMenoUscite(strapi, w.id, mese);
    await strapi.db.query(MOV).create({ data: { Importo: Math.max(0, suggerito), Data: `${mese}-01`, Mese: mese, salvadanaio: standard.id } });
    strapi.log.info(`Salvadanaio: chiuso ${mese} per "${w.Nome}" a ${Math.max(0, suggerito)} (entrate − uscite)`);
  }
}

/**
 * Migrazione dal vecchio salvadanaio (un record per mese con `risparmiato`):
 * per ogni wallet crea la cartella standard e, per i mesi che non ce l'hanno
 * ancora, il movimento del risparmio. Idempotente: si può rilanciare a ogni
 * avvio. Il vecchio record non si tocca.
 */
async function migraVecchio(strapi) {
  let creati = 0;
  for (const w of await strapi.db.query(WALLET).findMany({ select: ['id'] })) {
    const standard = await assicuraStandard(strapi, w.id);
    const vecchi = await strapi.db.query(VECCHIO).findMany({ where: { wallet: { id: w.id }, risparmiato: { $gt: 0 } } });
    for (const v of vecchi) {
      const mese = String(v.mese || '').slice(0, 7);
      if (!MESE_RE.test(mese)) continue;
      const esiste = await strapi.db.query(MOV).count({ where: { salvadanaio: { id: standard.id }, Mese: mese, Importo: { $gte: 0 } } });
      if (esiste) continue;
      await strapi.db.query(MOV).create({ data: { Importo: r2(v.risparmiato), Data: `${mese}-01`, Mese: mese, Nota: 'dal vecchio salvadanaio', salvadanaio: standard.id } });
      creati++;
    }
  }
  if (creati) strapi.log.info(`Salvadanaio: migrati ${creati} mesi dal vecchio salvadanaio`);
  return creati;
}

// ── Versamenti automatici nel salvadanaio (progetto.md §16) ──────────────────

/**
 * Da quale mese dei Risparmi mensili prendere `importo`: l'ultimo mese CHIUSO
 * che ne ha abbastanza. null se nessuno basta.
 */
async function meseDisponibile(strapi, standardId, importo, prima = meseDi()) {
  const movs = await strapi.db.query(MOV).findMany({ where: { salvadanaio: { id: standardId }, Mese: { $lt: prima } }, select: ['id', 'Importo', 'Mese'] });
  const disp = new Map();
  for (const m of movs) disp.set(m.Mese, r2((disp.get(m.Mese) || 0) + Number(m.Importo)));
  return [...disp].filter(([, v]) => v >= importo - 0.004).map(([k]) => k).sort().pop() || null;
}

/** La categoria di sistema dei versamenti nel salvadanaio (nascosta), creata se manca. */
async function categoriaSalvadanaio(strapi, walletId) {
  const q = strapi.db.query(CATEGORIA);
  return (await q.findOne({ where: { wallet: { id: walletId }, Tipo: 'salvadanaio' } }))
    || q.create({ data: { Nome: 'Salvadanaio', Tipo: 'salvadanaio', icona: '🐷', Nascosta: true, Budget_categoria: 0, wallet: walletId } });
}

/**
 * Esegue un versamento automatico (dal cron o all'attivazione): un movimento
 * nella cartella, legato al template. Con fonte "mensili" i soldi escono
 * dall'ultimo mese chiuso che basta; se nessuno basta si salta (e si dice).
 */
async function versaDaRicorrenza(strapi, templateId, giorno) {
  const t = await strapi.db.query(TRANSAZIONE).findOne({
    where: { id: templateId },
    populate: { salvadanaio: { populate: { wallet: true } }, categorie: true },
  });
  const cartella = t?.salvadanaio;
  if (!cartella?.wallet) return false;
  const wallet = cartella.wallet;
  const importo = r2(t.Importo);
  let daMese = null;
  if (t.fonte === 'mensili') {
    const standard = await assicuraStandard(strapi, wallet.id);
    daMese = await meseDisponibile(strapi, standard.id, importo, giorno.slice(0, 7));
    if (!daMese) {
      strapi.log.warn(`Salvadanaio: versamento automatico di €${importo} in "${cartella.Nome}" saltato, nessun mese con abbastanza risparmi`);
      return false;
    }
  }
  await movimento(strapi, wallet, cartella.documentId, {
    importo, daMese, data: giorno, nota: t.Descrizione || 'Versamento automatico', ricorrenza: t.id,
    chi: t.pagatoDa === 'membro' ? 'membro' : 'creatore',
  });
  return true;
}

/**
 * Attiva "ogni mese, in automatico" (Transazioni → Salvadanaio). Il giorno è
 * quello di `data`; se la data è oggi o passata il primo versamento va subito.
 */
async function attivaAutomatico(strapi, wallet, documentId, { importo, fonte, data, nota, chi }, mioRuolo, utenteId) {
  const c = await cartellaDelWallet(strapi, documentId, wallet.id);
  if (c.Standard) throw new Errore('Nei Risparmi mensili il risparmio si chiude da solo a fine mese');
  const valore = importoValido(importo);
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : oggiIso();
  const cat = await categoriaSalvadanaio(strapi, wallet.id);
  const template = await strapi.db.query(TRANSAZIONE).create({
    data: {
      Importo: valore, Data: giorno, RicorrenzaTemporale: giorno, TransazioneRicorrente: true, InPausa: false,
      Descrizione: String(nota || '').trim().slice(0, 120) || `Salvadanaio · ${c.Nome}`,
      categorie: cat.id, salvadanaio: c.id, fonte: fonte === 'mensili' ? 'mensili' : 'nuovi', creatoDa: utenteId,
      pagatoDa: wallet.condiviso ? (['creatore', 'membro'].includes(chi) ? chi : mioRuolo || 'creatore') : null,
    },
  });
  if (giorno <= oggiIso()) {
    const fatto = await versaDaRicorrenza(strapi, template.id, giorno);
    if (!fatto) {
      await strapi.db.query(TRANSAZIONE).delete({ where: { id: template.id } });
      throw new Errore('Nessun mese chiuso ha abbastanza risparmi per questo versamento');
    }
  }
  return template.documentId;
}

module.exports = {
  attivaAutomatico, versaDaRicorrenza, meseDisponibile,
  Errore, assicuraStandard, stato, creaCartella, modificaCartella, eliminaCartella, movimento,
  eliminaMovimento, impostaRisparmio, chiudiMese, migraVecchio, entrateMenoUscite, meseDi,
};
