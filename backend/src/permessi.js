'use strict';

// Permessi che l'app richiede al ruolo "Authenticated", seedati a ogni avvio.
//
// Prima si abilitavano a mano nel pannello admin (Impostazioni → Users &
// Permissions → Ruoli → Authenticated) e bastava dimenticarne uno per avere un
// 403 su una funzione. Con più persone che installano l'app è una trappola, e un
// nuovo utente deve poter usare tutto da subito.
//
// Si AGGIUNGONO solo i mancanti, non si toglie mai nulla: i permessi in più
// abilitati dall'admin restano. Contro: se si disabilita uno di questi dal
// pannello, al riavvio torna acceso. Per toglierne uno davvero va tolto da qui.
//
// Il ruolo "Public" non si tocca.

const CRUD = ['find', 'findOne', 'create', 'update', 'delete'];
const su = (uid, azioni) => azioni.map((a) => `${uid}.${a}`);

const PERMESSI = [
  ...su('api::wallet.wallet', CRUD),
  ...su('api::categorie.categorie', CRUD),
  ...su('api::transazioni.transazioni', CRUD),
  // Niente delete: lo storico non si cancella dal client (la cascata lo toglie
  // lato server quando sparisce il portafoglio, vedi cascata.js).
  ...su('api::salvadanaio.salvadanaio', ['find', 'findOne', 'create', 'update']),
  ...su('api::consiglio.consiglio', ['find', 'findOne', 'applica', 'segna']),
  ...su('api::analisi.analisi', ['analizza', 'testAi']),
  ...su('api::scontrino.scontrino', ['leggi']),
  ...su('api::profilo.profilo', ['caricaFoto', 'rimuoviFoto']),
  ...su('api::feedback.feedback', ['invia']),
  ...su('api::invito.invito', ['elenco', 'invita', 'accetta', 'rifiuta', 'annulla', 'esci']),
  ...su('api::cartella.cartella', ['stato', 'crea', 'modifica', 'elimina', 'movimento', 'eliminaMovimento', 'risparmio']),
  ...su('api::notifiche.notifiche', ['stato', 'salva', 'attiva', 'disattiva', 'prova']),
  // `user.find` sembra strano ma serve: i controller owner-aware filtrano per
  // `users_permissions_user` e Strapi 5 valida quel filtro contro i permessi del
  // ruolo (senza: "Invalid key users_permissions_user"). Non espone nulla: il
  // controller in extensions/users-permissions/strapi-server.js restituisce solo
  // l'utente stesso.
  ...su('plugin::users-permissions.user', ['me', 'update', 'find']),
  ...su('plugin::users-permissions.auth', ['changePassword']),
];

async function seedPermessi(strapi) {
  const ruolo = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  if (!ruolo) return;

  const query = strapi.db.query('plugin::users-permissions.permission');
  const presenti = new Set((await query.findMany({ select: ['action'], where: { role: ruolo.id } })).map((p) => p.action));

  const mancanti = PERMESSI.filter((a) => !presenti.has(a));
  for (const action of mancanti) await query.create({ data: { action, role: ruolo.id } });
  if (mancanti.length) strapi.log.info(`Permessi: ${mancanti.length} abilitati al ruolo Authenticated`);
}

module.exports = { PERMESSI, seedPermessi };
