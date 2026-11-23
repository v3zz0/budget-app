import { api } from "./api.js";

// Salvadanaio a cartelle (backend: src/salvadanai.js). Ogni chiamata risponde
// con lo stato completo del portafoglio: dopo una scrittura la pagina si
// ridisegna con i numeri del server, senza ricalcolarli qui.
const U = "/api/salvadanai";

export const statoSalvadanaio = async (wallet) => (await api.get(U, { params: { wallet } })).data;
export const creaSalvadanaio = async (wallet, dati) => (await api.post(U, { wallet, ...dati })).data;
export const eliminaSalvadanaio = async (wallet, id) => (await api.delete(`${U}/${id}`, { params: { wallet } })).data;
/** importo > 0 versa, < 0 preleva. daMese "AAAA-MM": i soldi arrivano dai Risparmi mensili. */
export const muoviSalvadanaio = async (wallet, id, { importo, nota, daMese, chi }) =>
  (await api.post(`${U}/${id}/movimenti`, { wallet, importo, nota, ...(daMese && { daMese }), ...(chi && { chi }) })).data;
export const annullaMovimento = async (wallet, id) => (await api.delete(`${U}/movimenti/${id}`, { params: { wallet } })).data;
export const impostaRisparmio = async (wallet, mese, importo) => (await api.put(`${U}/risparmio`, { wallet, mese, importo })).data;
