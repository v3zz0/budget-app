import { api, elencaTutte } from "./api.js";
import { campiAi, ordinaModelli } from "@/utils/impostazioni.js";

// --- Portafogli -------------------------------------------------------------
// Il proprietario lo mette il server (controller wallet.create): qui non si
// manda, e se lo si mandasse verrebbe ignorato.
export const creaWallet = async (Nome, Budget) => (await api.post("/api/wallets", { data: { Nome, Budget } })).data.data;
export const aggiornaWallet = (id, Nome, Budget) => api.put(`/api/wallets/${id}`, { data: { Nome, Budget } });
// Il solo flag, separato: è un toggle, e mandare anche nome e budget
// significherebbe riscriverli con quello che la pagina ha in memoria, che può
// essere vecchio.
export const impostaEsclusione = (id, escludiDaStatistiche) =>
  api.put(`/api/wallets/${id}`, { data: { escludiDaStatistiche } });
export const eliminaWallet = (id) => api.delete(`/api/wallets/${id}`);

// --- Categorie --------------------------------------------------------------
export const elencaCategorie = (walletId) =>
  elencaTutte("/api/categories", {
    filters: { wallet: { documentId: { $eq: walletId } } },
    sort: ["Nome", "id"],
  });

export const creaCategoria = (walletId, { nome, budget, icona }) =>
  api.post("/api/categories", {
    data: { Nome: nome, Budget_categoria: budget, wallet: walletId, ...(icona && { icona }) },
  });

// icona sempre inviata: stringa vuota = tolta
export const aggiornaCategoria = (id, { nome, budget, icona }) =>
  api.put(`/api/categories/${id}`, { data: { Nome: nome, Budget_categoria: budget, icona } });

export const eliminaCategoria = (id) => api.delete(`/api/categories/${id}`);

// --- Profilo ----------------------------------------------------------------
// Il server limita PUT /api/users/:id al proprio profilo (strapi-server.js).
export const aggiornaProfilo = (userId, { username, email }) => api.put(`/api/users/${userId}`, { username, email });

export const cambiaPassword = (attuale, nuova) =>
  api.post("/api/auth/change-password", {
    currentPassword: attuale,
    password: nuova,
    passwordConfirmation: nuova,
  });

// --- Analisi AI -------------------------------------------------------------
export const salvaAi = (userId, impostazioni, chiave) => api.put(`/api/users/${userId}`, campiAi(impostazioni, chiave));

/** "Prova connessione" coi valori del form, anche non ancora salvati.
 *  Ritorna { ok, messaggio }. */
export const provaAi = async ({ motore, url, modello }, chiave) =>
  (await api.post("/api/analisi-test-ai", { motore, url, modello, ...(chiave && { chiave }) })).data;

/**
 * Elenco modelli di OpenRouter (endpoint pubblico, nessuna chiave).
 * `fetch` semplice e NON l'istanza `api`: quella allega il JWT di questa app,
 * che non deve mai arrivare a un servizio di terzi.
 */
export async function modelliOpenRouter() {
  const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Errore ${res.status}`);
  const { data = [] } = await res.json();
  return ordinaModelli(data.map((m) => String(m.id ?? "")).filter(Boolean));
}
