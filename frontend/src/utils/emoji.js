// Emoji delle categorie (progetto.md §18): UNA lista, usata da Transazioni →
// "+ Altro" e da Impostazioni → Categorie. Logica pura.

export const EMOJI_CATEGORIE = [
  "🏷️", "💼", "💰", "💶", "🏦", "📈", "🧾", "↩️", // soldi e lavoro
  "🛒", "🏠", "💡", "⛽", "🚘", "🚕", "✈️", // casa, spesa, trasporti
  "🏋️", "💪", "🧘", "⚽", "🚴", // sport e palestra
  "🎨", "🎮", "🎸", "📷", "🧶", "🎣", "📚", "🎬", // hobby e svago
  "🍕", "🍔", "☕", "🍷", // mangiare e bere
  "💊", "🏥", "💇", "👕", "🎁", "🎟️", // persona e regali
  "📱", "🐶", "🎓", "✂️", "🔧", "🌿", // altro
];

const segmenti = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("it", { granularity: "grapheme" }) : null;

/** La prima vera emoji di un testo (anche composta, es. 👨‍👩‍👧), oppure null se sono lettere o numeri. */
export function primaEmoji(testo) {
  const pezzi = segmenti ? [...segmenti.segment(String(testo ?? ""))].map((s) => s.segment) : [...String(testo ?? "")];
  return pezzi.find((p) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(p)) || null;
}

/**
 * La griglia da mostrare: l'emoji attuale se non è nella lista (così in
 * modifica compare per prima, già scelta), poi le recenti scritte a mano
 * (al massimo 8), poi la lista. Senza doppioni.
 */
export function griglia(attuale, recenti = [], lista = EMOJI_CATEGORIE) {
  const fuori = [attuale, ...recenti].filter((e) => e && !lista.includes(e));
  return [...new Set(fuori)].slice(0, 9).concat(lista);
}

/** Recenti aggiornate: la nuova in testa, al massimo 8. */
export const aggiungiRecente = (recenti, e) => [e, ...recenti.filter((x) => x !== e)].slice(0, 8);
