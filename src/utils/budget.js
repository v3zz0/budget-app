// Logica pura dell'app: niente Vue, niente axios, così si prova con
// `node --test src/utils/`. Le chiavi mese si costruiscono a mano (mai
// toISOString() su una data locale: a est di Greenwich restituisce il giorno
// prima), e le date Strapi ("2026-08-01") non passano mai da `new Date()`.

const pad = (n) => String(n).padStart(2, "0");

/** "2026-08-01" per un (anno, mese 1-12). */
export const primoDelMese = (anno, mese) => `${anno}-${pad(mese)}-01`;

/** Ultimo giorno del mese: il giorno 0 del mese dopo (bisestili inclusi). */
export const ultimoDelMese = (anno, mese) => {
  const g = new Date(anno, mese, 0).getDate();
  return `${anno}-${pad(mese)}-${pad(g)}`;
};

/** Un (anno, mese) spostato di `passo` mesi. */
export const spostaMese = ({ anno, mese }, passo) => {
  const d = new Date(anno, mese - 1 + passo, 1);
  return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
};

/** Oggi come "YYYY-MM-DD" locale. */
export const oggiIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Date -> "YYYY-MM-DD" locale (per il DatePicker). */
export const isoDaData = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" -> Date locale a mezzanotte. */
export const dataDaIso = (s) => {
  const [a, m, g] = s.split("-").map(Number);
  return new Date(a, m - 1, g);
};

/** "2026-08-05" -> "05/08/2026". */
export const dataIt = (s) => (s ? s.split("-").reverse().join("/") : "");

const NOMI_MESE = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
export const nomeMese = (mese) => NOMI_MESE[mese - 1];

/** "2026-08" per un (anno, mese 1-12): confronta con `mese.slice(0, 7)`. */
export const chiaveMese = (anno, mese) => `${anno}-${pad(mese)}`;

/**
 * Quanto è avanzato in un mese chiuso: budget meno speso, solo se positivo.
 * È la proposta per il salvadanaio, distinta da `risparmiato` (quanto
 * l'utente ha deciso di mettere via davvero). null se non c'è niente da dire.
 */
export const avanzato = (voce) => {
  if (!voce || !(voce.budgetAllocato > 0)) return null;
  const avanzo = voce.budgetAllocato - (voce.speso || 0);
  return avanzo > 0 ? avanzo : null;
};

/**
 * `€120` / `−€120`. Il segno è questione di design: un negativo deve leggersi
 * come tale anche in scala di grigi (accent ed errore hanno la stessa
 * luminanza), quindi non basta il colore.
 */
export const euro = (valore, decimali = 0) =>
  `${valore < 0 ? "−" : ""}€${Math.abs(valore).toFixed(decimali)}`;

/** Classe colore da abbinare a un valore: verde sopra zero, rosso sotto. */
export const coloreImporto = (valore) =>
  valore < 0 ? "text-errore-testo" : "text-positivo";

/**
 * Chiusura del mese tenendo il ritmo di spesa finora (estrapolazione lineare).
 * null se non ha senso: mese diverso da quello in corso, o nessuna spesa.
 */
export const proiezioneFineMese = (speso, { anno, mese }, adesso = new Date()) => {
  if (adesso.getFullYear() !== anno || adesso.getMonth() + 1 !== mese) return null;
  if (speso <= 0) return null;
  const totali = new Date(anno, mese, 0).getDate();
  const trascorsi = adesso.getDate();
  return trascorsi >= totali ? speso : (speso / trascorsi) * totali;
};
