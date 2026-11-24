'use strict';

const s = require('../../../salvadanai');
const { walletDiUtente, ruolo } = require('../../../accesso');

// Ogni azione: utente autenticato + portafoglio suo, poi la logica in
// src/salvadanai.js. Un portafoglio altrui risponde 404, come i controller
// owner-aware: non si conferma che esiste.
const azione = (fn) => async (ctx) => {
  const utente = ctx.state.user;
  if (!utente) return ctx.unauthorized();
  const body = ctx.request.body || {};
  const wallet = await walletDiUtente(strapi, ctx.query.wallet || body.wallet, utente.id);
  if (!wallet) return ctx.notFound('Portafoglio non trovato');
  try {
    const risultato = await fn({ ctx, body, wallet, utente });
    ctx.body = risultato ?? (await s.stato(strapi, wallet));
  } catch (e) {
    if (e instanceof s.Errore) {
      ctx.status = e.status;
      ctx.body = { data: null, error: { status: e.status, name: e.status === 404 ? 'NotFoundError' : 'ValidationError', message: e.message } };
      return;
    }
    throw e;
  }
};

module.exports = {
  stato: azione(() => null),
  crea: azione(async ({ body, wallet }) => {
    await s.creaCartella(strapi, wallet, body);
  }),
  modifica: azione(async ({ ctx, body, wallet }) => {
    await s.modificaCartella(strapi, wallet, ctx.params.id, body);
  }),
  elimina: azione(async ({ ctx, wallet }) => {
    await s.eliminaCartella(strapi, wallet, ctx.params.id);
  }),
  movimento: azione(async ({ ctx, body, wallet, utente }) => {
    await s.movimento(strapi, wallet, ctx.params.id, body, ruolo(wallet, utente.id));
  }),
  automatico: azione(async ({ ctx, body, wallet, utente }) => {
    await s.attivaAutomatico(strapi, wallet, ctx.params.id, body, ruolo(wallet, utente.id), utente.id);
  }),
  eliminaMovimento: azione(async ({ ctx, wallet }) => {
    await s.eliminaMovimento(strapi, wallet, ctx.params.id);
  }),
  risparmio: azione(async ({ body, wallet }) => {
    await s.impostaRisparmio(strapi, wallet, body.mese, body.importo);
  }),
};
