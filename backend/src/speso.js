"use strict";

// Quanto è stato speso davvero in un wallet, in un intervallo di date.
// Serve a chiudere il mese: `speso` è l'unico campo del salvadanaio che
// nessuno riempiva mai, e restando a 0 rendeva muta la card di dettaglio.
async function spesoDelPeriodo(strapi, walletDocumentId, dal, al) {
  // Solo le uscite: un'entrata (o un versamento in cassa) non è una spesa.
  const categorie = await strapi.documents("api::categorie.categorie").findMany({
    filters: { wallet: { documentId: walletDocumentId }, Tipo: "uscita" },
  });
  if (!categorie.length) return 0;

  const transazioni = await strapi.documents("api::transazioni.transazioni").findMany({
    filters: {
      categorie: { documentId: { $in: categorie.map((c) => c.documentId) } },
      Data: { $gte: dal, $lte: al },
    },
    limit: -1,
  });

  const totale = transazioni.reduce((s, t) => s + Number(t.Importo || 0), 0);
  return Number(totale.toFixed(2));
}

module.exports = { spesoDelPeriodo };
