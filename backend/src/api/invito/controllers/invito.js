'use strict';

const { walletDiUtente, ruolo } = require('../../../accesso');
const { bilancio } = require('../../../conti');

const INVITO = 'api::invito.invito';
const WALLET = 'api::wallet.wallet';
const USER = 'plugin::users-permissions.user';
const CATEGORIA = 'api::categorie.categorie';
const TRANSAZIONE = 'api::transazioni.transazioni';
const GIORNI_VALIDITA = 14;

const nome = (u) => (u?.nomeVisualizzato || u?.username || '').trim();
const oggi = () => new Date().toISOString().slice(0, 10);
const scaduto = (i) => i.scadenza && i.scadenza < oggi();

function errore(ctx, status, message) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name: status === 404 ? 'NotFoundError' : status === 403 ? 'ForbiddenError' : 'ValidationError', message } };
}

/** Movimenti di un wallet nella forma di src/conti.js. */
async function movimentiConto(walletId) {
  const righe = await strapi.db.query(TRANSAZIONE).findMany({
    where: { categorie: { wallet: { id: walletId } } },
    select: ['Importo', 'pagatoDa', 'quota', 'quotaCassa'],
    populate: { categorie: { select: ['Tipo'] } },
  });
  return righe.map((t) => ({ tipo: t.categorie?.Tipo || 'uscita', importo: t.Importo, pagatoDa: t.pagatoDa, quota: t.quota, quotaCassa: t.quotaCassa }));
}

/** Le categorie di sistema del condiviso: versamenti in cassa e rimborsi. */
async function categorieDiSistema(walletId) {
  for (const [Tipo, Nome, icona] of [['versamento', 'Versamenti in cassa', '🏦'], ['rimborso', 'Rimborsi', '🤝']]) {
    const c = await strapi.db.query(CATEGORIA).findOne({ where: { wallet: { id: walletId }, Tipo } });
    if (!c) await strapi.db.query(CATEGORIA).create({ data: { Nome, Tipo, icona, Nascosta: true, Budget_categoria: 0, wallet: walletId } });
  }
}

const invitoDi = (documentId) =>
  strapi.db.query(INVITO).findOne({ where: { documentId }, populate: { wallet: { populate: { users_permissions_user: true, membro: true } }, da: true, a: true } });

module.exports = {
  // Inviti ricevuti (da accettare) e inviati (in attesa), ancora validi.
  async elenco(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const lista = await strapi.db.query(INVITO).findMany({
      where: { stato: 'in_attesa', $or: [{ a: { id: u.id } }, { da: { id: u.id } }] },
      populate: { wallet: { select: ['documentId', 'Nome'] }, da: true, a: true },
      orderBy: { id: 'desc' },
    });
    const forma = (i) => ({ id: i.documentId, email: i.email, scadenza: i.scadenza, wallet: i.wallet && { id: i.wallet.documentId, nome: i.wallet.Nome }, da: nome(i.da), a: nome(i.a) });
    const validi = lista.filter((i) => !scaduto(i) && i.wallet);
    ctx.body = { ricevuti: validi.filter((i) => i.a?.id === u.id).map(forma), inviati: validi.filter((i) => i.da?.id === u.id).map(forma) };
  },

  async invita(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const { wallet: walletId, email } = ctx.request.body || {};
    const w = await walletDiUtente(strapi, walletId, u.id);
    if (!w) return ctx.notFound('Portafoglio non trovato');
    if (ruolo(w, u.id) !== 'creatore') return errore(ctx, 403, 'Solo chi ha creato il portafoglio può invitare');
    if (w.membro) return errore(ctx, 400, 'Il portafoglio è già condiviso: si condivide con una persona sola');
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return errore(ctx, 400, 'Indirizzo email non valido');
    if (mail === String(u.email).toLowerCase()) return errore(ctx, 400, 'Non puoi invitare te stesso');
    // Utente già esistente: gli account li crea solo l'amministratore.
    // ponytail: dire "nessun utente con questa email" rivela se un indirizzo
    //   ha un account; con pochi utenti creati a mano è accettabile, altrimenti
    //   rispondere sempre "invito inviato".
    const destinatario = await strapi.db.query(USER).findOne({ where: { email: mail } });
    if (!destinatario || destinatario.blocked) return errore(ctx, 404, 'Nessun utente con questa email: chiedi all\'amministratore di creare l\'account');
    const gia = await strapi.db.query(INVITO).count({ where: { wallet: { id: w.id }, stato: 'in_attesa', scadenza: { $gte: oggi() } } });
    if (gia) return errore(ctx, 400, 'C\'è già un invito in attesa per questo portafoglio');
    const scadenza = new Date(Date.now() + GIORNI_VALIDITA * 86400000).toISOString().slice(0, 10);
    const i = await strapi.db.query(INVITO).create({ data: { email: mail, stato: 'in_attesa', scadenza, wallet: w.id, da: u.id, a: destinatario.id } });
    // Push a chi è invitato, se ha attivato le notifiche
    try {
      await require('../../../notifiche/pianifica').notificaInvito(strapi, destinatario.id, i.documentId);
    } catch {
      strapi.log.warn('Notifiche: avviso di invito non inviato');
    }
    ctx.body = { id: i.documentId, email: mail, scadenza };
  },

  async accetta(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const i = await invitoDi(ctx.params.id);
    if (!i || i.a?.id !== u.id) return ctx.notFound('Invito non trovato');
    if (i.stato !== 'in_attesa' || scaduto(i)) return errore(ctx, 400, 'Invito non più valido');
    if (!i.wallet || i.wallet.membro) return errore(ctx, 400, 'Il portafoglio è già condiviso con un\'altra persona');
    await strapi.db.transaction(async () => {
      await strapi.db.query(WALLET).update({ where: { id: i.wallet.id }, data: { membro: u.id, condiviso: true, regolaTipo: 'meta', quotaCreatore: 0.5 } });
      await strapi.db.query(INVITO).update({ where: { id: i.id }, data: { stato: 'accettato' } });
      await categorieDiSistema(i.wallet.id);
    });
    ctx.body = { wallet: i.wallet.documentId };
  },

  async rifiuta(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const i = await invitoDi(ctx.params.id);
    if (!i || i.a?.id !== u.id || i.stato !== 'in_attesa') return ctx.notFound('Invito non trovato');
    await strapi.db.query(INVITO).update({ where: { id: i.id }, data: { stato: 'rifiutato' } });
    ctx.body = { ok: true };
  },

  async annulla(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const i = await invitoDi(ctx.params.id);
    if (!i || i.da?.id !== u.id || i.stato !== 'in_attesa') return ctx.notFound('Invito non trovato');
    await strapi.db.query(INVITO).update({ where: { id: i.id }, data: { stato: 'annullato' } });
    ctx.body = { ok: true };
  },

  // Il membro esce dal condiviso: solo con i conti a zero; il portafoglio
  // resta a chi l'ha creato, con tutti i movimenti.
  async esci(ctx) {
    const u = ctx.state.user;
    if (!u) return ctx.unauthorized();
    const w = await walletDiUtente(strapi, ctx.params.id, u.id);
    if (!w) return ctx.notFound('Portafoglio non trovato');
    if (ruolo(w, u.id) !== 'membro') return errore(ctx, 400, 'Chi ha creato il portafoglio non esce: può eliminarlo');
    const b = bilancio(await movimentiConto(w.id), Number(w.quotaCreatore ?? 0.5));
    if (Math.abs(b) >= 0.005) return errore(ctx, 400, `Prima saldate i conti: c'è ancora un conto aperto di €${Math.abs(b).toFixed(2).replace('.', ',')}`);
    await strapi.db.query(WALLET).update({ where: { id: w.id }, data: { membro: null, condiviso: false } });
    ctx.body = { ok: true };
  },
};
