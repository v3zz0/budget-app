import { api, elencaTutte } from "./api.js";

const URL = "/api/consiglios";

/** Consigli ancora attivi: "applicato" e "ignorato" restano nello storico
 *  lato server ma non servono qui. */
export const elencaConsigli = () =>
  elencaTutte(URL, {
    filters: { stato: { $in: ["nuovo", "letto"] } },
    populate: { categorie: { fields: ["Nome", "icona"] } },
    sort: ["createdAt:desc", "id:desc"],
  });

/** Scrive il budget proposto sulla categoria (lo fa il server). */
export const applicaConsiglio = (id) => api.post(`${URL}/${id}/applica`);

/** stato: "letto" (spegne il pallino) oppure "ignorato" (toglie dalla lista). */
export const segnaConsiglio = (id, stato) => api.post(`${URL}/${id}/segna`, { stato });
