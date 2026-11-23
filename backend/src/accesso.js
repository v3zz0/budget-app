'use strict';

// Chi può usare un portafoglio: chi l'ha creato (users_permissions_user) o il
// suo membro (portafoglio condiviso, progetto.md §12). UN punto solo, usato
// dai 5 controller owner-aware, dalle rotte custom (salvadanai, inviti,
// analisi): cambiando la regola qui cambia ovunque.
//
// L'altro membro vede SOLO il portafoglio condiviso: nessuna regola qui apre
// i portafogli personali del creatore.

const WALLET = 'api::wallet.wallet';

/** Filtro Strapi su un wallet: lo usa chi l'ha creato o il suo membro. */
const filtroWallet = (userId) => ({
  $or: [{ users_permissions_user: { id: { $eq: userId } } }, { membro: { id: { $eq: userId } } }],
});

/** Da passare a `populate` del wallet per poter chiamare `puoUsare`. */
const POPULATE_ACCESSO = { users_permissions_user: true, membro: true };

/** Il wallet (popolato con POPULATE_ACCESSO) è dell'utente o ne è membro? */
const puoUsare = (wallet, userId) =>
  !!wallet && !!userId && (wallet.users_permissions_user?.id === userId || wallet.membro?.id === userId);

/** Ruolo dell'utente nel wallet: "creatore", "membro" o null. */
const ruolo = (wallet, userId) =>
  wallet?.users_permissions_user?.id === userId ? 'creatore' : wallet?.membro?.id === userId ? 'membro' : null;

/** Il wallet (per documentId) se l'utente può usarlo, altrimenti null. */
async function walletDiUtente(strapi, documentId, userId) {
  if (!documentId || !userId) return null;
  const w = await strapi.db.query(WALLET).findOne({ where: { documentId, ...filtroWallet(userId) }, populate: POPULATE_ACCESSO });
  return w || null;
}

module.exports = { filtroWallet, POPULATE_ACCESSO, puoUsare, ruolo, walletDiUtente };
