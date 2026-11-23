'use strict';

// Chi può usare un portafoglio. UN punto solo, usato dalle rotte custom
// (salvadanai, ...): cambiando la regola qui cambia ovunque.

const WALLET = 'api::wallet.wallet';

/** Il wallet (per documentId) se l'utente può usarlo, altrimenti null. */
async function walletDiUtente(strapi, documentId, userId) {
  if (!documentId || !userId) return null;
  const w = await strapi.db.query(WALLET).findOne({
    where: { documentId, users_permissions_user: { id: userId } },
  });
  return w || null;
}

module.exports = { walletDiUtente };
