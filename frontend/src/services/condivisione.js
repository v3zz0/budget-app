import { api } from "./api.js";

// Portafoglio condiviso (backend: api/invito, controller wallet).
export const elencaInviti = async () => (await api.get("/api/inviti")).data;
export const invita = async (wallet, email) => (await api.post("/api/inviti", { wallet, email })).data;
export const accettaInvito = async (id) => (await api.post(`/api/inviti/${id}/accetta`)).data;
export const rifiutaInvito = (id) => api.post(`/api/inviti/${id}/rifiuta`);
export const annullaInvito = (id) => api.post(`/api/inviti/${id}/annulla`);
export const esciDalPortafoglio = (walletId) => api.post(`/api/portafogli/${walletId}/esci`);
/** regola = { regolaTipo, quotaCreatore?, entrateCreatore?, entrateMembro? }: la quota la risolve il server. */
export const salvaRegola = (walletId, regola) => api.put(`/api/wallets/${walletId}`, { data: regola });
