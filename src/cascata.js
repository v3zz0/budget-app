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
//   wallet    → categorie → transazioni
//             → salvadanaio
//   categoria → transazioni, consigli
//
// `salvadanaio.delete` resta disabilitato per il CLIENT (lo storico non si
// cancella a mano): qui lo si toglie perché è il suo portafoglio a sparire.

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
}

module.exports = { registra, eliminaDove };
