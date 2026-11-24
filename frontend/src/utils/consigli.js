// Consigli sul budget (progetto.md §19). I numeri li calcola il server
// (motore-consigli.js); qui solo come presentarli. Logica pura.
import { eur } from "./formato.js";
import { nomeMese } from "./budget.js";

const corto = (v) => eur(v, { corto: true });

/** Frase in grande, spiegazione e bottone di una scheda. */
export function descrivi(c) {
  const mesi = c.mesiAnalizzati || [];
  const nome = c.categorie?.Nome || "Categoria";
  const media = mesi.length ? mesi.reduce((s, m) => s + Number(m.speso || 0), 0) / mesi.length : 0;
  const sopra = mesi.filter((m) => m.speso > c.budgetAttuale).length;
  const r = { media, sopra, ok: `Porta a ${corto(c.budgetProposto)}` };
  if (c.tipo === "alza") {
    return { ...r, h: `${nome}: sfori ${sopra} mesi su ${mesi.length}`,
      p: `In media spendi ${corto(Math.round(media))} al mese, il budget è ${corto(c.budgetAttuale)}. Con ${corto(c.budgetProposto)} il budget torna realistico e gli avvisi tornano a contare.` };
  }
  return { ...r, h: `${nome}: avanzano soldi ogni mese`,
    p: `Negli ultimi ${mesi.length} mesi hai speso in media ${corto(Math.round(media))} su ${corto(c.budgetAttuale)}, senza mai sforare. Scendendo a ${corto(c.budgetProposto)} liberi ${corto(c.budgetAttuale - c.budgetProposto)} al mese per altro.` };
}

/** Mini grafico: altezze in % sulla stessa scala di barre e linee. */
export function scala(c) {
  const mesi = c.mesiAnalizzati || [];
  const cima = Math.max(...mesi.map((m) => m.speso), c.budgetAttuale || 0, c.budgetProposto || 0, 1) * 1.12;
  const y = (v) => (v / cima) * 100;
  return {
    barre: mesi.map((m) => ({ mese: m.mese, speso: m.speso, h: y(m.speso), sopra: m.speso > c.budgetAttuale, nome: nomeMese(Number(m.mese.slice(5, 7))) })),
    attuale: y(c.budgetAttuale),
    proposto: y(c.budgetProposto),
  };
}

/** Quanto cambia il budget delle categorie accettandoli tutti. */
export const differenza = (lista) => lista.reduce((s, c) => s + (Number(c.budgetProposto) - Number(c.budgetAttuale)), 0);

/**
 * Categorie di spesa che non hanno ancora 3 mesi con spese negli ultimi 6
 * chiusi (la soglia del server): quanti ne mancano. righe = transazioni.
 */
export function inAttesa(categorie, righe, mesiChiusi) {
  const attivi = new Map();
  for (const r of righe) {
    const m = r.data.slice(0, 7);
    if (!mesiChiusi.includes(m)) continue;
    if (!attivi.has(r.categoriaId)) attivi.set(r.categoriaId, new Set());
    attivi.get(r.categoriaId).add(m);
  }
  return categorie
    .filter((c) => (c.Tipo || "uscita") === "uscita" && !c.Nascosta)
    .map((c) => ({ c, n: attivi.get(c.documentId)?.size || 0 }))
    .filter((x) => x.n > 0 && x.n < 3)
    .map((x) => ({ ...x.c, mancano: 3 - x.n }));
}
