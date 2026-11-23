import test from "node:test";
import assert from "node:assert/strict";
import { budgetCategorie, coloreCategoria, fette, variazione } from "./home.js";

const t = (...importi) => importi.map((Importo) => ({ Importo }));
const cat = [
  { documentId: "a", Nome: "Auto", Tipo: "uscita", Budget_categoria: 100, transazionis: t(50) },
  { documentId: "b", Nome: "Bar", Tipo: "uscita", Budget_categoria: 100, transazionis: t(85) },
  { documentId: "c", Nome: "Casa", Tipo: "uscita", Budget_categoria: 100, transazionis: t(80, 40) },
  { documentId: "d", Nome: "Svago", Tipo: "uscita", transazionis: t(10) },
  { documentId: "s", Nome: "Stipendio", Tipo: "entrata", Budget_categoria: 2000, transazionis: t(1800) },
];

test("variazione sul mese precedente", () => {
  assert.equal(variazione(110, 100, 10), "+10% vs ott");
  assert.equal(variazione(50, 100, 12), "−50% vs dic");
  assert.equal(variazione(50, 0, 10), "—");
});

test("soglie del budget: 85% vicino, oltre il 100% sforato", () => {
  const b = budgetCategorie(cat);
  assert.deepEqual(b.voci.map((v) => [v.id, v.stato]), [["a", "ok"], ["b", "vicino"], ["c", "sforato"]]);
  assert.equal(b.voci[2].rimanente, -20);
  assert.equal(b.voci[2].percentuale, 100);
  assert.deepEqual([b.budget, b.speso, b.rimanente], [300, 255, 45], "senza budget e le entrate restano fuori");
});

test("il colore segue la categoria, non la posizione", () => {
  assert.equal(coloreCategoria(cat, cat[2]), "var(--color-chart-3)");
  assert.equal(coloreCategoria(cat, cat[4]), "var(--color-chart-1)", "si conta dentro il proprio tipo");
  const f = fette(cat, "uscita");
  assert.deepEqual(f.map((x) => x.id), ["c", "b", "a", "d"]);
  assert.equal(f[0].colore, "var(--color-chart-3)");
});
