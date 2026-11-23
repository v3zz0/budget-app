'use strict';

const trasporto = require('../../../notifiche/trasporto');
const calendario = require('../../../notifiche/calendario');
const { USER, DEVICE, improntaValida, idBrowserValido, utilizzabile, registra } = require('../../../notifiche/dispositivi');

module.exports = {
  async stato(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    ctx.set('Cache-Control', 'no-store');
    const vapid = trasporto.configurazione();
    const { impronta } = ctx.query;
    const dispositivo = typeof impronta === 'string' && improntaValida.test(impronta)
      ? await strapi.db.query(DEVICE).findOne({ where: { impronta, utente: utente.id } })
      : null;
    ctx.body = {
      publicKey: vapid?.publicKey ?? null,
      attivo: utilizzabile(dispositivo, vapid),
      preferenze: calendario.preferenze(utente),
      fuso: calendario.fuso,
    };
  },

  async salva(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    const value = ctx.request.body;
    if (!calendario.valide(value)) return ctx.badRequest('Controlla l’orario e le preferenze.');
    const aggiornato = await strapi.db.query(USER).update({
      where: { id: utente.id },
      data: {
        orarioNotificheWeb: value.orario + ':00',
        anticipoNotifiche: value.scadenze,
        avvisiBudget: value.budget,
      },
    });
    ctx.body = calendario.preferenze(aggiornato);
  },

  async attiva(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    const vapid = trasporto.configurazione();
    if (!vapid) return ctx.throw(503, 'Notifiche non configurate sul server.');
    const iscrizione = trasporto.validaIscrizione(ctx.request.body);
    const idBrowser = ctx.request.body?.idBrowser;
    if (!iscrizione || typeof idBrowser !== 'string' || !idBrowserValido.test(idBrowser))
      return ctx.badRequest('Iscrizione del browser non valida.');
    const impronta = await registra(strapi.db.query(DEVICE), utente.id, idBrowser, iscrizione, vapid);
    if (!impronta) return ctx.throw(409, 'Rinnova l’iscrizione di questo dispositivo.');
    ctx.body = { impronta };
  },

  async disattiva(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    if (!improntaValida.test(ctx.params.impronta)) return ctx.badRequest('Dispositivo non valido.');
    const repo = strapi.db.query(DEVICE);
    const dispositivo = await repo.findOne({
      where: { utente: utente.id, impronta: ctx.params.impronta }, select: ['id'],
    });
    if (dispositivo) await repo.delete({ where: { id: dispositivo.id } });
    ctx.status = 204;
  },

  async prova(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    if (!improntaValida.test(ctx.params.impronta)) return ctx.badRequest('Dispositivo non valido.');
    const vapid = trasporto.configurazione();
    const repo = strapi.db.query(DEVICE);
    const dispositivo = await repo.findOne({ where: { utente: utente.id, impronta: ctx.params.impronta } });
    if (!utilizzabile(dispositivo, vapid)) return ctx.notFound('Attiva le notifiche su questo dispositivo.');
    const adesso = new Date();
    const { count } = await repo.updateMany({
      where: { id: dispositivo.id, $or: [{ ultimoTest: null }, { ultimoTest: { $lt: new Date(+adesso - 60000) } }] },
      data: { ultimoTest: adesso },
    });
    if (!count) return ctx.throw(429, 'Attendi un minuto prima di inviare un’altra prova.');

    try {
      await trasporto.invia(dispositivo, { tipo: 'prova', tag: 'budget-prova' }, vapid);
    } catch (err) {
      if (trasporto.rispostaDefinitiva(err)) {
        await repo.delete({ where: { id: dispositivo.id } });
        return ctx.notFound('Iscrizione scaduta. Attiva nuovamente le notifiche.');
      }
      return ctx.throw(502, 'Il servizio notifiche non ha accettato la prova.');
    }
    ctx.status = 204;
  },
};
