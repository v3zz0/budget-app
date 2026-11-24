import test from "node:test";
import assert from "node:assert/strict";
import { calcolaAnno, mesiDaContare } from "./anno.js";

const r = (data, importo, categoriaId, categoria = "") => ({ data, importo, categoriaId, categoria });
const cat = (documentId, Nome, Budget_categoria) => ({ documentId, Nome, Budget_categoria });
const agosto2026 = new Date(2026, 7, 15);

test("mesiDaContare: passato 12, corrente = mesi trascorsi, futuro 0", () => {
  assert.equal(mesiDaContare(2025, agosto2026), 12);
  assert.equal(mesiDaContare(2026, agosto2026), 8);
  assert.equal(mesiDaContare(2027, agosto2026), 0);
});

test("aggrega per mese e categoria, ordina per speso", () => {
  const out = calcolaAnno({
    anno: 2026,
    adesso: agosto2026,
    categorie: [cat("a", "Cibo", 100), cat("b", "Casa", 50), cat("c", "Vuota", 30)],
    righe: [r("2026-01-10", 40, "a"), r("2026-01-20", 10, "a"), r("2026-03-01", 70, "b")],
  });
  assert.equal(out.speso, 120);
  assert.equal(out.perMese[0], 50);
  assert.equal(out.perMese[2], 70);
  assert.deepEqual(out.categorie.map((c) => c.documentId), ["b", "a", "c"]);
  const a = out.categorie.find((c) => c.documentId === "a");
  assert.equal(a.budgetStimato, 200); // 100 x 2 mesi con movimenti (gennaio e marzo)
  assert.equal(a.oltreStima, false);
  assert.equal(out.mesiConsiderati, 2);
  assert.equal(out.budgetStimato, 200 + 100 + 60);
});

test("la categoria con budget e zero spese resta nell'elenco", () => {
  const out = calcolaAnno({ anno: 2026, adesso: agosto2026, categorie: [cat("c", "Vuota", 30)], righe: [] });
  assert.equal(out.categorie.length, 1);
  assert.equal(out.vuoto, true);
});

test("categoria eliminata: le spese restano nel totale", () => {
  const out = calcolaAnno({
    anno: 2026, adesso: agosto2026, categorie: [],
    righe: [r("2026-02-02", 25, "x", "Vecchia"), r("2026-02-03", 5, "y")],
  });
  assert.equal(out.speso, 30);
  assert.equal(out.categorie.find((c) => c.documentId === "x").nome, "Vecchia");
  assert.equal(out.categorie.find((c) => c.documentId === "y").nome, "Categoria eliminata");
  assert.equal(out.categorie[0].percentuale, null); // nessun budget, nessuna percentuale
});

test("righe di un altro anno non entrano nel totale", () => {
  const out = calcolaAnno({ anno: 2026, adesso: agosto2026, categorie: [], righe: [r("2025-12-31", 99, "a"), r("2026-01-01", 1, "a")] });
  assert.equal(out.speso, 1);
});

test("oltre la stima", () => {
  const out = calcolaAnno({ anno: 2025, adesso: agosto2026, categorie: [cat("a", "Cibo", 10)], righe: [r("2025-05-05", 121, "a")] });
  assert.equal(out.categorie[0].budgetStimato, 10, "un mese con movimenti");
  assert.equal(out.categorie[0].oltreStima, true);
});

test("le entrate non entrano nello speso", () => {
  const r = calcolaAnno({
    anno: 2026,
    adesso: new Date(2026, 11, 31),
    categorie: [
      { documentId: "u", Nome: "Spesa", Budget_categoria: 100, Tipo: "uscita" },
      { documentId: "e", Nome: "Stipendio", Budget_categoria: 2000, Tipo: "entrata" },
    ],
    righe: [
      { data: "2026-03-01", importo: 50, categoriaId: "u", categoria: "Spesa", tipo: "uscita" },
      { data: "2026-03-27", importo: 1800, categoriaId: "e", categoria: "Stipendio", tipo: "entrata" },
    ],
  });
  assert.equal(r.speso, 50);
  assert.equal(r.entrate, 1800);
  assert.equal(r.entratePerMese[2], 1800);
  assert.equal(r.categorie.length, 1);
});

test("mesi dell'anno e tre fatti", async () => {
  const { mesiAnno, fatti, miePerMese } = await import("./anno.js");
  const r = { perMese: [0, 0, 0, 0, 0, 0, 0, 0, 1200, 1000, 900, 0], entratePerMese: [0, 0, 0, 0, 0, 0, 0, 0, 1800, 1800, 1800, 0] };
  const m = mesiAnno(r, 2026, new Date(2026, 10, 24));
  assert.equal(m[10].aperto, true);
  assert.equal(m[11].futuro, true);
  assert.equal(m[8].saldo, 600);
  const f = fatti(m);
  assert.equal(f.migliore.i, 9, "ottobre: +800 (novembre è in corso e non conta)");
  assert.equal(f.caro.i, 8);
  assert.equal(f.media, 1100);
  assert.equal(f.quanti, 3);
  const mie = miePerMese([{ tipo: "uscita", data: "2026-09-02", importo: 100 }, { tipo: "entrata", data: "2026-09-02", importo: 50 }], 2026, () => 0.5);
  assert.equal(mie[8], 50);
});
