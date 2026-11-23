'use strict';

module.exports = {
  routes: [
    { method: 'POST', path: '/profilo/foto', handler: 'profilo.caricaFoto', config: { policies: [] } },
    { method: 'DELETE', path: '/profilo/foto', handler: 'profilo.rimuoviFoto', config: { policies: [] } },
  ],
};
