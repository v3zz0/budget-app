'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/scontrino/leggi',
      handler: 'scontrino.leggi',
      config: {
        // Autenticata. Va abilitata anche per il ruolo "Authenticated" in
        // Impostazioni → Users & Permissions → Ruoli → Scontrino → leggi,
        // altrimenti risponde 403.
        policies: [],
      },
    },
  ],
};
