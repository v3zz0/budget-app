// Logica pura della Home (progetto.md §4.1). Niente Vue né rete.
import { nomeMese } from "./budget.js";

/** "+12% vs ott" / "—" se il mese prima era a zero. */
export function variazione(ora, prima, mesePrima) {
  if (!prima) return "—";
  const d = Math.round(((ora - prima) / prima) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}% vs ${nomeMese(mesePrima).slice(0, 3).toLowerCase()}`;
}

/**
 * Colore di una categoria nel grafico: segue la categoria, non la posizione
 * nella torta, così una categoria ha sempre lo stesso colore qualunque sia il
 * mese. Indice nell'elenco (stabile, ordinato per nome) delle categorie di
 * quel tipo, sulla palette validata di 6 colori.
 */
export function coloreCategoria(categorie, cat) {
  const stesse = categorie.filter((c) => (c.Tipo || "uscita") === (cat.Tipo || "uscita"));
  const i = Math.max(0, stesse.findIndex((c) => c.documentId === cat.documentId));
  return `var(--color-chart-${(i % 6) + 1})`;
}

/** Fette per tipo ("entrata"|"uscita"), dalla più grande. */
export function fette(categorie, tipo) {
  return categorie
    .filter((c) => (c.Tipo || "uscita") === tipo)
    .map((c) => ({
      id: c.documentId,
      nome: c.Nome,
      valore: (c.transazionis || []).reduce((s, t) => s + (Number(t.Importo) || 0), 0),
      colore: coloreCategoria(categorie, c),
    }))
    .filter((f) => f.valore > 0)
    .sort((a, b) => b.valore - a.valore);
}

/**
 * Budget per categoria: solo uscite con un budget. stato: "ok" sotto l'85%,
 * "vicino" dall'85% al 100%, "sforato" oltre il budget.
 */
export function budgetCategorie(categorie) {
  const voci = categorie
    .filter((c) => (c.Tipo || "uscita") === "uscita" && Number(c.Budget_categoria) > 0)
    .map((c) => {
      const budget = Number(c.Budget_categoria);
      const speso = Math.round((c.transazionis || []).reduce((s, t) => s + (Number(t.Importo) || 0), 0) * 100) / 100;
      const quota = speso / budget;
      return {
        id: c.documentId, nome: c.Nome, icona: c.icona, budget, speso,
        rimanente: Math.round((budget - speso) * 100) / 100,
        percentuale: Math.min(100, quota * 100),
        stato: speso > budget ? "sforato" : quota >= 0.85 ? "vicino" : "ok",
      };
    });
  const budget = voci.reduce((s, v) => s + v.budget, 0);
  const speso = voci.reduce((s, v) => s + v.speso, 0);
  return { voci, budget, speso, rimanente: Math.round((budget - speso) * 100) / 100 };
}

/** Arco di ciambella in SVG da a0 ad a1 (radianti), raggio esterno r, interno ri. */
export function arco(cx, cy, r, ri, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, ri), [x3, y3] = p(a0, ri);
  return `M${x0} ${y0}A${r} ${r} 0 ${grande} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${grande} 0 ${x3} ${y3}Z`;
}
