import { nomeMese } from "./budget.js";

// Prossima scadenza di una transazione ricorrente.
//
// REPLICA la regola del cron backend `materializzaRicorrenti`
// (backend/src/ricorrenti.js): il giorno di riferimento è
// `RicorrenzaTemporale || Data`, e se quel giorno nel mese non esiste (il 31
// a febbraio) la scadenza scatta l'ultimo giorno del mese.
// Se cambia una, cambiare l'altra.

// Il giorno si legge dalla stringa: `new Date("2026-01-31")` è UTC e a ovest
// di Greenwich darebbe il 30.
const giornoRiferimento = (t) => Number((t.RicorrenzaTemporale || t.Data).slice(8, 10));

// `mese` 1-12; anche 13 (= gennaio dell'anno dopo), lo normalizza Date.
const conClamp = (anno, mese, giorno) => {
  const d = new Date(anno, mese - 1, 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth(), Math.min(giorno, ultimo));
};

/** Giorno del mese in cui scatta (1-31). */
export const giornoRicorrenza = giornoRiferimento;

/**
 * Prossima scadenza a partire da `oggi`. Se cade oggi ritorna oggi.
 * null se è in pausa: il cron non la registra (backend src/ricorrenti.js).
 */
export function prossimaScadenza(t, oggi = new Date()) {
  if (t.InPausa) return null;
  const giorno = giornoRiferimento(t);
  const questoMese = conClamp(oggi.getFullYear(), oggi.getMonth() + 1, giorno);
  if (questoMese.getDate() >= oggi.getDate()) return questoMese;
  return conClamp(oggi.getFullYear(), oggi.getMonth() + 2, giorno);
}

/** "oggi" / "domani" / "fra 3 giorni" / "il 12 set". */
export function quando(prossima, oggi = new Date()) {
  const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const giorni = Math.round((prossima - inizioOggi) / 86400000);
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "domani";
  if (giorni < 7) return `fra ${giorni} giorni`;
  return `il ${prossima.getDate()} ${nomeMese(prossima.getMonth() + 1).slice(0, 3).toLowerCase()}`;
}
