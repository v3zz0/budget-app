import { api } from "./api.js";

const URL = "/api/transazionis";

// Il form lavora con nomi suoi, Strapi vuole i suoi (chiavi API miste
// italiano/inglese: non normalizzarle). RicorrenzaTemporale vale la data solo
// per i template: su una spesa normale non ha un giorno che torna.
const corpo = (t) => ({
  data: {
    Importo: t.importo,
    Descrizione: t.descrizione,
    Data: t.data,
    TransazioneRicorrente: t.ricorrente,
    RicorrenzaTemporale: t.ricorrente ? t.data : null,
    Contanti: t.contanti,
    categorie: t.categoriaId,
  },
});

export const creaTransazione = (t) => api.post(URL, corpo(t));
export const aggiornaTransazione = (id, t) => api.put(`${URL}/${id}`, corpo(t));
export const eliminaTransazione = (id) => api.delete(`${URL}/${id}`);

export const trovaTransazione = async (id) =>
  (await api.get(`${URL}/${id}`, { params: { populate: { categorie: { fields: ["Nome"] } } } }))
    .data.data;
