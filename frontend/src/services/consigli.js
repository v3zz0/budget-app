import { api, elencaTutte } from "./api.js";

const URL = "/api/consiglios";

/** Consigli ancora attivi: "applicato" e "ignorato" restano nello storico
 *  lato server ma non servono qui. */
export const elencaConsigli = () =>
  elencaTutte(URL, {
    filters: { stato: { $in: ["nuovo", "letto"] } },
    // il portafoglio della categoria: la pagina mostra quelli del portafoglio scelto
    populate: { categorie: { fields: ["Nome", "icona"], populate: { wallet: { fields: ["documentId"] } } } },
    sort: ["createdAt:desc", "id:desc"],
  });

/** Scrive il budget proposto sulla categoria (lo fa il server). */
export const applicaConsiglio = (id) => api.post(`${URL}/${id}/applica`);

/** Annulla: un consiglio applicato rimette il budget di prima, uno ignorato torna da guardare. */
export const annullaConsiglio = (id) => api.post(`${URL}/${id}/annulla`);

/** stato: "letto" (spegne il pallino) oppure "ignorato" (toglie dalla lista). */
export const segnaConsiglio = (id, stato) => api.post(`${URL}/${id}/segna`, { stato });
