'use strict';

/**
 * transazioni controller
 *
 * Owner-aware: una transazione appartiene all'utente se la sua categoria
 * appartiene a un wallet dell'utente.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { filtroWallet, POPULATE_ACCESSO, puoUsare, ruolo } = require('../../../accesso');

// Portafoglio condiviso (progetto.md §12). Chi ha creato e chi ha modificato
// li scrive il server. Nel condiviso: pagatoDa (default: chi registra), quota
// (default: la regola del portafoglio) e quotaCassa, che NON viene dal client:
// è la regola di quel momento, salvata sul movimento così che cambiarla dopo
// non riscriva i conti passati. Fuori dal condiviso questi campi non esistono.
function campiCondivisi(data, wallet, userId, nuova, prima = null) {
  delete data.creatoDa;
  delete data.modificatoDa;
  delete data.quotaCassa;
  if (nuova) data.creatoDa = userId;
  else data.modificatoDa = userId;
  if (!wallet?.condiviso) {
    data.pagatoDa = null;
    data.quota = null;
    if (nuova) data.quotaCassa = null;
    return;
  }
  const regola = Number(wallet.quotaCreatore ?? 0.5);
  if (!['creatore', 'membro', 'cassa'].includes(data.pagatoDa)) {
    data.pagatoDa = prima?.pagatoDa || ruolo(wallet, userId) || 'creatore';
  }
  if (data.quota != null) data.quota = Math.min(1, Math.max(0, Math.round(Number(data.quota) * 100) / 100)) || 0;
  else if (nuova) data.quota = regola;
  else delete data.quota;
  if (nuova || prima?.quotaCassa == null) data.quotaCassa = regola;
}

const UID = 'api::transazioni.transazioni';
const CATEGORIA_UID = 'api::categorie.categorie';

async function transazioneDelloUtente(strapi, documentId, userId) {
  const entry = await strapi.documents(UID).findOne({
    documentId,
    populate: {
      categorie: { populate: { wallet: { populate: POPULATE_ACCESSO } } },
    },
  });
  return entry && puoUsare(entry.categorie?.wallet, userId) ? entry : null;
}

async function categoriaDelloUtente(strapi, documentId, userId) {
  const entry = await strapi.documents(CATEGORIA_UID).findOne({
    documentId,
    populate: { wallet: { populate: POPULATE_ACCESSO } },
  });
  return entry && puoUsare(entry.wallet, userId) ? entry : null;
}

module.exports = createCoreController(UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    // `$and` per coesistere col filtro client (es. filtro per categoria).
    ctx.query = ctx.query || {};
    const filtroClient = ctx.query.filters || {};
    ctx.query.filters = {
      $and: [
        filtroClient,
        { categorie: { wallet: filtroWallet(userId) } },
      ],
    };
    return super.find(ctx);
  },

  async findOne(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const ok = await transazioneDelloUtente(strapi, ctx.params.id, userId);
    if (!ok) return ctx.notFound();
    return super.findOne(ctx);
  },

  async create(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const data = ctx.request.body && ctx.request.body.data;
    const catRef = data && data.categorie;
    if (!catRef) return ctx.badRequest('Categoria mancante');

    const cat = await categoriaDelloUtente(strapi, catRef, userId);
    if (!cat) return ctx.forbidden('Categoria non accessibile');
    campiCondivisi(data, cat.wallet, userId, true);

    // Invio da telefono creato offline: se la stessa transazione (stesso
    // ClientUuid) è già stata salvata in un tentativo precedente la cui
    // risposta si è persa per strada, si ritorna quella invece di duplicarla.
    const clientUuid = data.ClientUuid;
    if (clientUuid) {
      const esistente = await strapi.documents(UID).findFirst({
        filters: { ClientUuid: { $eq: clientUuid } },
        populate: { categorie: { populate: { wallet: { populate: POPULATE_ACCESSO } } } },
      });
      if (esistente && puoUsare(esistente.categorie?.wallet, userId)) {
        ctx.status = 200;
        const sanitized = await this.sanitizeOutput(esistente, ctx);
        return this.transformResponse(sanitized);
      }
    }

    return super.create(ctx);
  },

  async update(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const ok = await transazioneDelloUtente(strapi, ctx.params.id, userId);
    if (!ok) return ctx.notFound();

    // Riassegnazione a categoria altrui: blocca
    ctx.request.body = ctx.request.body || {};
    const data = (ctx.request.body.data = ctx.request.body.data || {});
    const nuovaCat = data.categorie;
    let wallet = ok.categorie.wallet;
    if (nuovaCat && nuovaCat !== ok.categorie.documentId) {
      const target = await categoriaDelloUtente(strapi, nuovaCat, userId);
      if (!target) return ctx.forbidden('Categoria di destinazione non accessibile');
      wallet = target.wallet;
    }
    campiCondivisi(data, wallet, userId, false, ok);

    return super.update(ctx);
  },

  async delete(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const ok = await transazioneDelloUtente(strapi, ctx.params.id, userId);
    if (!ok) return ctx.notFound();
    return super.delete(ctx);
  },
}));
