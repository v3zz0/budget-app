// Formattazione importi come nel mockup: "€1.388,00", "−€74,00", "+€150,00".
// Il meno è il carattere tipografico "−", non il trattino.
const nf = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const nfCorto = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });

/** corto: niente ",00" sugli interi ("€1.200", ma "€112,50"). */
export function eur(n, { segno = false, corto = false } = {}) {
  const v = Number(n) || 0;
  const s = v < 0 ? "−" : segno && v > 0 ? "+" : "";
  const a = Math.abs(v);
  return s + "€" + (corto && Math.round(a * 100) % 100 === 0 ? nfCorto.format(a) : nf.format(a));
}

/** Percentuale intera "72%". */
export const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

/** Arrotonda ai centesimi. */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
