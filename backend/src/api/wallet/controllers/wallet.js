'use strict';

/**
 * wallet controller
 *
 * Owner-aware: ogni utente vede e modifica solo i wallet che ha creato e quello
 * condiviso di cui è membro (src/accesso.js). Il filtro è applicato lato
 * server: il client non può aggirarlo passando filtri custom.
 *
 * Portafoglio condiviso (progetto.md §12): `membro` e `condiviso` cambiano
 * SOLO dagli inviti (api/invito), mai da qui. Elimina solo chi l'ha creato.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { filtroWallet, POPULATE_ACCESSO, puoUsare } = require('../../../accesso');
const { quotaRegola } = require('../../../conti');

const UID = 'api::wallet.wallet';

// Dell'altra persona si mostrano nome e avatar, non l'email né altro.
const PERSONA = { fields: ['username', 'nomeVisualizzato', 'avatar', 'coloreAvatar'] };
const conPersone = (ctx) => {
  ctx.query = ctx.query || {};
  ctx.query.populate = { users_permissions_user: PERSONA, membro: PERSONA };
};

// Campi che il client non scrive mai: proprietario e condivisione.
function pulisci(data) {
  for (const k of ['users_permissions_user', 'membro', 'condiviso']) delete data[k];
  // La quota del creatore la calcola il server dalla regola
  if (data.regolaTipo !== undefined || data.quotaCreatore !== undefined || data.entrateCreatore !== undefined || data.entrateMembro !== undefined) {
    return true;
  }
  return false;
}

const trova = (documentId) => strapi.documents(UID).findOne({ documentId, populate: POPULATE_ACCESSO });

module.exports = createCoreController(UID, ({ strapi }) => ({
  async find(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    // `$and` per non sovrascrivere eventuali filtri del client.
    ctx.query = ctx.query || {};
    const filtroClient = ctx.query.filters || {};
    ctx.query.filters = { $and: [filtroClient, filtroWallet(userId)] };
    conPersone(ctx);
    return super.find(ctx);
  },

  async findOne(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();
    if (!puoUsare(await trova(ctx.params.id), userId)) return ctx.notFound();
    conPersone(ctx);
    return super.findOne(ctx);
  },

  async create(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    // Forziamo l'owner: ignoriamo qualunque users_permissions_user passato dal client
    ctx.request.body = ctx.request.body || {};
    const data = { ...(ctx.request.body.data || {}) };
    pulisci(data);
    ctx.request.body.data = { ...data, users_permissions_user: userId, condiviso: false };
    const risposta = await super.create(ctx);
    // Ogni portafoglio nasce col suo salvadanaio "Risparmi mensili"
    const creato = await strapi.db.query(UID).findOne({ where: { documentId: risposta.data.documentId } });
    if (creato) await require('../../../salvadanai').assicuraStandard(strapi, creato.id);
    return risposta;
  },

  async update(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const entry = await trova(ctx.params.id);
    if (!puoUsare(entry, userId)) return ctx.notFound();

    const data = ctx.request.body?.data;
    if (data && pulisci(data)) {
      // Regola di divisione: si salva già risolta in quotaCreatore. Non è
      // retroattiva: ogni transazione ha la sua quota (controller transazioni).
      const regola = {
        regolaTipo: data.regolaTipo ?? entry.regolaTipo,
        quotaCreatore: data.quotaCreatore ?? entry.quotaCreatore,
        entrateCreatore: data.entrateCreatore ?? entry.entrateCreatore,
        entrateMembro: data.entrateMembro ?? entry.entrateMembro,
      };
      data.quotaCreatore = quotaRegola(regola);
    }
    conPersone(ctx);
    return super.update(ctx);
  },

  async delete(ctx) {
    const userId = ctx.state.user && ctx.state.user.id;
    if (!userId) return ctx.unauthorized();

    const entry = await trova(ctx.params.id);
    if (!puoUsare(entry, userId)) return ctx.notFound();
    // Nel condiviso elimina solo chi l'ha creato: l'altro può solo uscire.
    if (entry.users_permissions_user?.id !== userId) return ctx.forbidden('Solo chi ha creato il portafoglio può eliminarlo');
    return super.delete(ctx);
  },
}));
