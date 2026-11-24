'use strict';

// Solo rotte custom: nessun CRUD generico sulle cartelle e sui movimenti, così
// le regole (proprietario, saldo mai sotto zero, spostamenti in transazione)
// stanno in un posto solo (src/salvadanai.js). Ogni rotta vuole ?wallet= o
// body.wallet: il controller verifica che il portafoglio sia dell'utente.
const r = (method, path, handler) => ({ method, path, handler: `cartella.${handler}`, config: { policies: [] } });

module.exports = {
  routes: [
    r('GET', '/salvadanai', 'stato'),
    r('POST', '/salvadanai', 'crea'),
    r('PUT', '/salvadanai/risparmio', 'risparmio'),
    r('PUT', '/salvadanai/:id', 'modifica'),
    r('DELETE', '/salvadanai/:id', 'elimina'),
    r('POST', '/salvadanai/:id/movimenti', 'movimento'),
    r('POST', '/salvadanai/:id/automatico', 'automatico'),
    r('DELETE', '/salvadanai/movimenti/:id', 'eliminaMovimento'),
  ],
};
