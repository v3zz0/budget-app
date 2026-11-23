import { elencaTutte } from "./api.js";
import { primoDelMese, ultimoDelMese } from "@/utils/budget.js";

/**
 * Categorie del portafoglio, ognuna con dentro le SOLE transazioni del mese.
 *
 * Il filtro per mese lo fa il server. Non tornare a `populate=*`: in Strapi 5
 * le relazioni popolate non si possono limitare né paginare, quindi il
 * payload cresceva senza tetto (50 spese/mese, dopo tre anni = 1800 record
 * scaricati a ogni apertura della home).
 */
export async function caricaMese(walletId, { anno, mese }) {
  const categorie = await elencaTutte("/api/categories", {
    filters: { wallet: { documentId: { $eq: walletId } } },
    sort: ["Nome", "id"],
  });
  if (!categorie.length) return [];

  const transazioni = await elencaTutte("/api/transazionis", {
    filters: {
      categorie: { wallet: { documentId: { $eq: walletId } } },
      Data: { $gte: primoDelMese(anno, mese), $lte: ultimoDelMese(anno, mese) },
    },
    populate: { categorie: { fields: ["Nome"] }, creatoDa: { fields: ["id"] }, modificatoDa: { fields: ["id"] } },
    // "id" come spareggio: senza, due spese nello stesso giorno possono
    // duplicarsi o saltare tra una pagina e l'altra.
    sort: ["Data:desc", "id:desc"],
  });

  // Una mappa e non un filter per categoria: 20 categorie x 300 spese = 6000 test.
  const perCategoria = new Map();
  for (const t of transazioni) {
    const id = t.categorie?.documentId;
    if (!perCategoria.has(id)) perCategoria.set(id, []);
    perCategoria.get(id).push(t);
  }
  return categorie.map((c) => ({ ...c, transazionis: perCategoria.get(c.documentId) ?? [] }));
}

/**
 * Tutti i movimenti di un portafoglio condiviso, nella forma di utils/conti.js:
 * il conto tra voi conta TUTTI i movimenti, non solo quelli del mese.
 */
export async function caricaConto(walletId) {
  const righe = await elencaTutte("/api/transazionis", {
    filters: { categorie: { wallet: { documentId: { $eq: walletId } } } },
    fields: ["Importo", "Data", "pagatoDa", "quota", "quotaCassa"],
    populate: { categorie: { fields: ["Tipo"] } },
    sort: ["Data:asc", "id:asc"],
  });
  return righe.map((t) => ({
    tipo: t.categorie?.Tipo || "uscita", importo: Number(t.Importo) || 0, data: t.Data,
    pagatoDa: t.pagatoDa, quota: t.quota, quotaCassa: t.quotaCassa,
  }));
}
