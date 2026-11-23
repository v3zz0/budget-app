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

// tipo: "uscita" | "entrata". nascosta: categoria nata da "+ Altro" senza
// "Aggiungi alle mie categorie" (vale per quel movimento, non compare tra le pillole).
export const creaCategoria = async (walletId, { nome, budget, icona, tipo = "uscita", nascosta = false }) =>
  (
    await api.post("/api/categories", {
      data: { Nome: nome, Budget_categoria: budget, wallet: walletId, Tipo: tipo, Nascosta: nascosta, ...(icona && { icona }) },
    })
  ).data.data;

// icona sempre inviata: stringa vuota = tolta
export const aggiornaCategoria = (id, { nome, budget, icona }) =>
  api.put(`/api/categories/${id}`, { data: { Nome: nome, Budget_categoria: budget, icona } });

/** Quante transazioni (di sempre) ha un filtro: una richiesta da 1 riga, si legge il totale. */
const conta = async (filters) =>
  (await api.get("/api/transazionis", { params: { filters, pagination: { pageSize: 1 }, fields: ["id"] } })).data.meta
    .pagination.total;
export const contaTransazioniWallet = (walletId) => conta({ categorie: { wallet: { documentId: { $eq: walletId } } } });
export const contaTransazioniCategoria = (id) => conta({ categorie: { documentId: { $eq: id } } });
export const consigliCategoria = (id) =>
  elencaTutte("/api/consiglios", { filters: { categorie: { documentId: { $eq: id } } }, fields: ["tipo", "stato"] });

export const eliminaCategoria = (id) => api.delete(`/api/categories/${id}`);

// --- Profilo ----------------------------------------------------------------
// Il server limita PUT /api/users/:id al proprio profilo (strapi-server.js).
// Campi qualsiasi tra username, email, nomeVisualizzato, coloreAvatar, tema.
export const aggiornaProfilo = (userId, campi) => api.put(`/api/users/${userId}`, campi);

/** Foto profilo: la ritaglia e riduce il server (256px). Ritorna il data URL. */
export async function caricaFoto(file) {
  const form = new FormData();
  form.append("foto", file, file.name || "foto.jpg");
  return (await api.post("/api/profilo/foto", form, { timeout: 60000 })).data.avatar;
}
export const rimuoviFoto = () => api.delete("/api/profilo/foto");

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
