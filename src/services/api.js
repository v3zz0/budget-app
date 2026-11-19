import axios from "axios";
import qs from "qs";

export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:1337";

export const api = axios.create({
  baseURL: apiUrl,
  timeout: 15000,
  paramsSerializer: (params) =>
    qs.stringify(params, { arrayFormat: "repeat", skipNulls: true }),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 = il JWT non vale più: la sessione va chiusa. Il layer HTTP segnala e
// basta (lo registra main.js), non naviga e non tocca lo store.
// 403 invece NON chiude la sessione: è un permesso Strapi mancante su quella
// rotta, errore della singola chiamata (altrimenti una funzione secondaria
// negata butta fuori l'utente da tutto).
let onSessioneScaduta = () => {};
export const impostaSessioneScaduta = (fn) => (onSessioneScaduta = fn);

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/api/auth/")) {
      onSessioneScaduta();
    }
    return Promise.reject(err);
  },
);

/** Messaggio per l'utente da un errore qualunque. */
export function erroreLeggibile(e) {
  const s = e?.response?.status;
  if (s === 401) return "Sessione scaduta. Effettua nuovamente il login.";
  if (s === 403)
    return "Il server non autorizza questa funzione. Controlla i permessi del tuo utente.";
  if (s === 404) return "Risorsa non trovata.";
  if (s >= 500) return "Errore del server. Riprova più tardi.";
  if (e?.code === "ECONNABORTED") return "Il server non risponde. Controlla la connessione.";
  if (e?.request && !e.response) return "Nessuna connessione al server.";
  return e?.response?.data?.error?.message || "Si è verificato un errore. Riprova.";
}

/**
 * Tutte le pagine di una lista Strapi. Un mese normale è una chiamata sola
 * (il ciclo esce subito); oltre 100 record il totale non resta più
 * silenziosamente troncato. 100 = maxLimit di budget-api/config/api.js.
 */
export async function elencaConTotale(url, params = {}) {
  const righe = [];
  let totale = 0;
  for (let page = 1; page <= 200; page++) {
    const { data } = await api.get(url, {
      params: { ...params, pagination: { page, pageSize: 100 } },
    });
    righe.push(...data.data);
    totale = data.meta?.pagination?.total ?? totale;
    if (page >= (data.meta?.pagination?.pageCount ?? 1) || !data.data.length) break;
  }
  // `totale` è quello dichiarato dal server: chi mostra somme (export, anno)
  // confronta `righe.length` con `totale` e deve dirlo se non coincidono,
  // perché un totale parziale che si spaccia per completo non dà segnali.
  return { righe, totale };
}

export const elencaTutte = async (url, params) => (await elencaConTotale(url, params)).righe;
