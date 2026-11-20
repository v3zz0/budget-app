'use strict';

// Cancellazione a cascata.
//
// Strapi non cancella i figli di un record: eliminare un portafoglio o una
// categoria lasciava nel database categorie, transazioni, salvadanaio e consigli
// orfani. All'utente sparivano (i filtri risalgono la catena fino al
// proprietario e un orfano non ne ha uno), ma i dati restavano: con più utenti
// "elimina" deve voler dire eliminato.
//
// Sta in un middleware dei Documents e non nei controller: copre così anche il
// pannello admin e qualunque codice futuro, e i controller owner-aware restano
// quelli di sempre. Tutto dentro una transazione: o va via tutto o niente.
//
//   utente    → wallet (e quindi tutto quello sotto)
//   wallet    → categorie → transazioni
//             → salvadanaio
//   categoria → transazioni, consigli
//
// `salvadanaio.delete` resta disabilitato per il CLIENT (lo storico non si
// cancella a mano): qui lo si toglie perché è il suo portafoglio a sparire.

const USER = 'plugin::users-permissions.user';
const WALLET = 'api::wallet.wallet';
const CATEGORIA = 'api::categorie.categorie';
const TRANSAZIONE = 'api::transazioni.transazioni';
const SALVADANAIO = 'api::salvadanaio.salvadanaio';
const CONSIGLIO = 'api::consiglio.consiglio';

// Righe per giro: tiene corte le query anche con migliaia di transazioni
// (e sotto il limite di variabili di SQLite).
const BLOCCO = 500;

// Cancella tutte le righe che soddisfano `where`, a blocchi. Select + delete per
// id e non una DELETE con join: funziona uguale su MySQL, Postgres e SQLite.
async function eliminaDove(strapi, uid, where) {
  for (;;) {
    const righe = await strapi.db.query(uid).findMany({ select: ['id'], where, limit: BLOCCO });
    if (!righe.length) return;
    await strapi.db.query(uid).deleteMany({ where: { id: { $in: righe.map((r) => r.id) } } });
  }
}

// Figli di un gruppo di categorie (per id interno). La categoria stessa la
// cancella Strapi dopo, o `eliminaCategorie` se si parte dal portafoglio.
async function eliminaFigliDiCategorie(strapi, ids) {
  if (!ids.length) return;
  await eliminaDove(strapi, TRANSAZIONE, { categorie: { id: { $in: ids } } });
  await eliminaDove(strapi, CONSIGLIO, { categorie: { id: { $in: ids } } });
}

async function eliminaFigliDiWallet(strapi, walletId) {
  const categorie = await strapi.db.query(CATEGORIA).findMany({ select: ['id'], where: { wallet: { id: walletId } } });
  const ids = categorie.map((c) => c.id);
  await eliminaFigliDiCategorie(strapi, ids);
  await eliminaDove(strapi, CATEGORIA, { wallet: { id: walletId } });
  await eliminaDove(strapi, SALVADANAIO, { wallet: { id: walletId } });
}

const FIGLI = { [WALLET]: eliminaFigliDiWallet, [CATEGORIA]: (strapi, id) => eliminaFigliDiCategorie(strapi, [id]) };

// Eliminare un utente (dall'admin) elimina i suoi dati: i suoi wallet, passando
// dal Documents API così scatta la cascata di sopra. Va fatto PRIMA della delete
// dell'utente (beforeDelete): dopo, il legame wallet → utente non c'è più e i
// wallet non si potrebbero nemmeno ritrovare.
async function eliminaWalletDegliUtenti(strapi, where) {
  const utenti = await strapi.db.query(USER).findMany({ select: ['id'], where });
  if (!utenti.length) return;
  const wallets = await strapi.db.query(WALLET).findMany({
    select: ['documentId'],
    where: { users_permissions_user: { id: { $in: utenti.map((u) => u.id) } } },
  });
  for (const w of wallets) await strapi.documents(WALLET).delete({ documentId: w.documentId });
}

/** Da chiamare in `register`: aggancia la cascata alle delete di wallet e categorie. */
function registra(strapi) {
  strapi.documents.use(async (ctx, next) => {
    const elimina = FIGLI[ctx.uid];
    if (ctx.action !== 'delete' || !elimina) return next();

    const record = await strapi.db.query(ctx.uid).findOne({ select: ['id'], where: { documentId: ctx.params.documentId } });
    if (!record) return next(); // non esiste: ci pensa Strapi a rispondere

    return strapi.db.transaction(async () => {
      await elimina(strapi, record.id);
      return next(); // cancella il record principale, nella stessa transazione
    });
  });

  // Tutte le strade che cancellano un utente (admin, API, codice) passano da qui.
  strapi.db.lifecycles.subscribe({
    models: [USER],
    beforeDelete: (event) => eliminaWalletDegliUtenti(strapi, event.params.where),
    beforeDeleteMany: (event) => eliminaWalletDegliUtenti(strapi, event.params.where),
  });
}

// ── Pulizia degli orfani ─────────────────────────────────────────────────────
// Prima della cascata, eliminare un wallet o una categoria lasciava i figli nel
// database. Non li vede nessuno (i filtri risalgono al proprietario), ma ci
// sono. `trovaOrfani` li elenca senza toccare nulla, `eliminaOrfani` li toglie.
// Si usano dallo script scripts/pulisci-orfani.js.
//
// Orfano = figlio rimasto senza il suo genitore: categoria senza wallet,
// transazione senza categoria (o di una categoria orfana), salvadanaio senza
// wallet, consiglio senza categoria (o di una categoria orfana).
//
// Un wallet SENZA UTENTE non conta come orfano di default: non è una
// conseguenza del buco della cascata, può essere un dato di prima che esistesse
// il campo proprietario, ed è l'unico caso in cui si cancellerebbero dati che
// forse a qualcuno servono. Si include solo con `walletSenzaUtente: true`.

const TIPI = { wallet: WALLET, categorie: CATEGORIA, transazioni: TRANSAZIONE, salvadanaio: SALVADANAIO, consigli: CONSIGLIO };

/** Quante righe ci sono per tipo. Serve a dire cosa è stato eliminato. */
async function conteggi(strapi) {
  const out = {};
  for (const [nome, uid] of Object.entries(TIPI)) out[nome] = await strapi.db.query(uid).count();
  return out;
}

/** Elenca gli orfani, SENZA modificare nulla. */
async function trovaOrfani(strapi) {
  const q = (uid) => strapi.db.query(uid);

  const categorie = await q(CATEGORIA).findMany({ select: ['id', 'documentId', 'Nome'], where: { wallet: null } });
  const conta = async (uid, dove) => (await q(uid).count({ where: dove }));

  // Wallet senza utente, col contenuto che sparirebbe insieme a loro.
  const walletSenzaUtente = [];
  for (const w of await q(WALLET).findMany({ select: ['id', 'documentId', 'Nome'], where: { users_permissions_user: null } })) {
    walletSenzaUtente.push({
      ...w,
      categorie: await conta(CATEGORIA, { wallet: { id: w.id } }),
      transazioni: await conta(TRANSAZIONE, { categorie: { wallet: { id: w.id } } }),
    });
  }

  const orfani = {
    categorie,
    // Transazioni e consigli: senza categoria, oppure di una categoria orfana.
    // UNA query con $or e non due conteggi sommati: con i LEFT JOIN una riga
    // senza categoria soddisfa anche "la sua categoria non ha wallet", e la
    // somma la conterebbe due volte.
    transazioni: await conta(TRANSAZIONE, { $or: [{ categorie: null }, { categorie: { wallet: null } }] }),
    salvadanaio: await conta(SALVADANAIO, { wallet: null }),
    consigli: await conta(CONSIGLIO, { $or: [{ categorie: null }, { categorie: { wallet: null } }] }),
    walletSenzaUtente,
  };
  orfani.totale = orfani.categorie.length + orfani.transazioni + orfani.salvadanaio + orfani.consigli;
  return orfani;
}

/** Elimina gli orfani, in una transazione sola. Ritorna quante righe sono sparite per tipo. */
async function eliminaOrfani(strapi, { walletSenzaUtente = false } = {}) {
  const prima = await conteggi(strapi);

  await strapi.db.transaction(async () => {
    if (walletSenzaUtente) {
      const wallets = await strapi.db.query(WALLET).findMany({ select: ['documentId'], where: { users_permissions_user: null } });
      // Dal Documents API: scatta la cascata completa (categorie, transazioni, salvadanaio, consigli).
      for (const w of wallets) await strapi.documents(WALLET).delete({ documentId: w.documentId });
    }
    const categorie = await strapi.db.query(CATEGORIA).findMany({ select: ['id'], where: { wallet: null } });
    const ids = categorie.map((c) => c.id);
    for (let i = 0; i < ids.length; i += BLOCCO) await eliminaFigliDiCategorie(strapi, ids.slice(i, i + BLOCCO));
    await eliminaDove(strapi, CATEGORIA, { wallet: null });
    await eliminaDove(strapi, TRANSAZIONE, { categorie: null });
    await eliminaDove(strapi, SALVADANAIO, { wallet: null });
    await eliminaDove(strapi, CONSIGLIO, { categorie: null });
  });

  const dopo = await conteggi(strapi);
  return Object.fromEntries(Object.keys(TIPI).map((k) => [k, prima[k] - dopo[k]]));
}

module.exports = { registra, eliminaDove, trovaOrfani, eliminaOrfani };
