'use strict';

// Inviti al portafoglio condiviso e uscita (progetto.md §12). Niente email:
// l'invito si fa verso un utente GIÀ esistente (creato dall'admin), cercato
// per email, e si accetta dentro l'app. Solo rotte custom.
const r = (method, path, handler) => ({ method, path, handler: `invito.${handler}`, config: { policies: [] } });

module.exports = {
  routes: [
    r('GET', '/inviti', 'elenco'),
    r('POST', '/inviti', 'invita'),
    r('POST', '/inviti/:id/accetta', 'accetta'),
    r('POST', '/inviti/:id/rifiuta', 'rifiuta'),
    r('POST', '/inviti/:id/annulla', 'annulla'),
    r('POST', '/portafogli/:id/esci', 'esci'),
  ],
};
