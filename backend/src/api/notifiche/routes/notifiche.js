'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/notifiche', handler: 'notifiche.stato' },
    { method: 'PUT', path: '/notifiche/preferenze', handler: 'notifiche.salva' },
    { method: 'PUT', path: '/notifiche/dispositivi', handler: 'notifiche.attiva' },
    { method: 'DELETE', path: '/notifiche/dispositivi/:impronta', handler: 'notifiche.disattiva' },
    { method: 'POST', path: '/notifiche/dispositivi/:impronta/prova', handler: 'notifiche.prova' },
  ],
};
