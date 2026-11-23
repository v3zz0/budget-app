import { api, elencaTutte } from "./api.js";

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
    // Condiviso: chi ha pagato e la parte di chi ha creato il portafoglio
    // (il server mette i default e la quota della cassa)
    ...(t.pagatoDa && { pagatoDa: t.pagatoDa }),
    ...(t.quota != null && { quota: t.quota }),
  },
});

export const creaTransazione = (t) => api.post(URL, corpo(t));
export const aggiornaTransazione = (id, t) => api.put(`${URL}/${id}`, corpo(t));
export const eliminaTransazione = (id) => api.delete(`${URL}/${id}`);

// I template ricorrenti, di qualunque mese: vivono nel mese in cui sono stati
// creati, quindi la lista del mese della dashboard non li contiene.
export const elencaRicorrenti = (walletId) =>
  elencaTutte(URL, {
    filters: {
      TransazioneRicorrente: { $eq: true },
      categorie: { wallet: { documentId: { $eq: walletId } } },
    },
    populate: { categorie: { fields: ["Nome", "icona", "Tipo"] } },
    sort: ["Data:desc", "id:desc"],
  });

/** Modifica di una ricorrente dalle Impostazioni: importo, giorno, pausa. */
export const aggiornaRicorrente = (id, campi) => api.put(`${URL}/${id}`, { data: campi });

/**
 * Interrompe una ricorrente: il template torna una transazione normale del suo
 * mese. Non si elimina: il template È anche la prima spesa registrata.
 */
export const interrompiRicorrente = (id) =>
  api.put(`${URL}/${id}`, { data: { TransazioneRicorrente: false, RicorrenzaTemporale: null, InPausa: false } });

export const trovaTransazione = async (id) =>
  (await api.get(`${URL}/${id}`, { params: { populate: { categorie: { fields: ["Nome", "Tipo", "Nascosta", "icona"] }, creatoDa: { fields: ["id"] }, modificatoDa: { fields: ["id"] } } } }))
    .data.data;

/** Modifica di singoli campi (Analisi: "Era in contanti", "Usa importo banca"). */
export const aggiornaCampi = (id, campi) => api.put(`${URL}/${id}`, { data: campi });
