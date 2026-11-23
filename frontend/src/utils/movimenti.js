// Movimenti del mese: logica pura per Transazioni e Home (niente Vue né rete).
import { nomeMese } from "./budget.js";

/** "1.234,50" / "12,5" / "12.50" -> numero; null se non è un importo valido. */
export function parseImporto(s) {
  let t = String(s ?? "").trim().replace(/[€\s]/g, "");
  if (!t) return null;
  // Con la virgola i punti sono migliaia. Senza: "1.800" e "1.234.567" sono
  // migliaia (gruppi da tre cifre), "12.5" è un decimale scritto all'inglese.
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Numero -> testo per il campo importo ("12,50"). */
export const testoImporto = (n) => (n == null ? "" : String(Number(n).toFixed(2)).replace(".", ","));

/**
 * Categorie (ognuna con le transazioni del mese, services/dashboard.js) ->
 * lista piatta di movimenti, dal più recente. Il tipo viene dalla categoria.
 */
export function appiattisci(categorie) {
  const out = [];
  for (const c of categorie) {
    for (const t of c.transazionis || []) {
      out.push({ ...t, importo: Number(t.Importo) || 0, tipo: c.Tipo || "uscita", cat: c });
    }
  }
  return out.sort((a, b) => (a.Data < b.Data ? 1 : a.Data > b.Data ? -1 : (b.id || 0) - (a.id || 0)));
}

/** Entrate, uscite e saldo di una lista di movimenti. */
export function totali(movimenti) {
  let entrate = 0;
  let uscite = 0;
  for (const m of movimenti) {
    if (m.tipo === "entrata") entrate += m.importo;
    else if (m.tipo === "uscita") uscite += m.importo;
  }
  const r = (n) => Math.round(n * 100) / 100;
  return { entrate: r(entrate), uscite: r(uscite), saldo: r(entrate - uscite) };
}

const GIORNI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Oggi", "Ieri", "Lunedì 21 novembre". */
export function etichettaGiorno(data, oggi = new Date()) {
  if (data === iso(oggi)) return "Oggi";
  const ieri = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1);
  if (data === iso(ieri)) return "Ieri";
  const [a, m, g] = data.split("-").map(Number);
  return `${GIORNI[new Date(a, m - 1, g).getDay()]} ${g} ${nomeMese(m).toLowerCase()}`;
}

/** Movimenti (già ordinati) -> [{ data, etichetta, movimenti }]. */
export function perGiorno(movimenti, oggi = new Date()) {
  const gruppi = [];
  for (const m of movimenti) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo?.data === m.Data) ultimo.movimenti.push(m);
    else gruppi.push({ data: m.Data, etichetta: etichettaGiorno(m.Data, oggi), movimenti: [m] });
  }
  return gruppi;
}

export { iso as isoLocale };
