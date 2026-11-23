'use strict';

const trasporto = require('./trasporto');

const USER = 'plugin::users-permissions.user';
const DEVICE = 'api::notifica-dispositivo.notifica-dispositivo';
const improntaValida = /^[a-f0-9]{64}$/;
const idBrowserValido = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function duplicato(err) {
  return ['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE', '23505'].includes(err.code);
}

function utilizzabile(device, vapid, now = Date.now()) {
  return !!device && !!vapid && device.chiavePubblica === vapid.publicKey &&
    (device.iscrizione.expirationTime == null || device.iscrizione.expirationTime > now);
}

async function registra(repo, utente, idBrowser, iscrizione, vapid) {
  const impronta = trasporto.sha(iscrizione.endpoint);
  const data = { iscrizione, chiavePubblica: vapid.publicKey };
  const esistente = await repo.findOne({ where: { impronta }, populate: { utente: { select: ['id'] } } });
  if (esistente) {
    if (esistente.utente?.id !== utente) return null;
    await repo.update({ where: { id: esistente.id }, data });
    return impronta;
  }

  try {
    await repo.create({ data: { ...data, impronta, utente, idBrowser } });
  } catch (err) {
    if (!duplicato(err)) throw err;
    const vincitore = await repo.findOne({ where: { impronta, utente } });
    return vincitore ? impronta : null;
  }
  return impronta;
}

module.exports = { USER, DEVICE, improntaValida, idBrowserValido, duplicato, utilizzabile, registra };
