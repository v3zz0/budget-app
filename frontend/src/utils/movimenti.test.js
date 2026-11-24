import test from "node:test";
import assert from "node:assert/strict";
import { appiattisci, etichettaGiorno, parseImporto, perGiorno, totali } from "./movimenti.js";

test("parseImporto all'italiana", () => {
  assert.equal(parseImporto("12,50"), 12.5);
  assert.equal(parseImporto("1.234,50"), 1234.5);
  assert.equal(parseImporto("12.5"), 12.5);
  assert.equal(parseImporto("1.234.567"), 1234567);
  assert.equal(parseImporto("1.800"), 1800, "migliaia all'italiana");
  assert.equal(parseImporto("12.50"), 12.5);
  assert.equal(parseImporto("€ 7"), 7);
  assert.equal(parseImporto(""), null);
  assert.equal(parseImporto("12,345"), null, "più di due decimali");
  assert.equal(parseImporto("abc"), null);
});

const cat = [
  { documentId: "u", Tipo: "uscita", transazionis: [{ id: 1, Data: "2026-11-03", Importo: 30 }, { id: 3, Data: "2026-11-20", Importo: 12.4 }] },
  { documentId: "e", Tipo: "entrata", transazionis: [{ id: 2, Data: "2026-11-20", Importo: 1800 }] },
  { documentId: "v", Tipo: "versamento", transazionis: [{ id: 4, Data: "2026-11-01", Importo: 300 }] },
];

test("appiattisci ordina dal più recente e porta il tipo", () => {
  const m = appiattisci(cat);
  assert.deepEqual(m.map((x) => x.id), [3, 2, 1, 4]);
  assert.equal(m[1].tipo, "entrata");
});

test("i versamenti automatici nel salvadanaio non sono movimenti", () => {
  assert.equal(appiattisci([...cat, { documentId: "s", Tipo: "salvadanaio", transazionis: [{ id: 9, Data: "2026-11-23", Importo: 100 }] }]).length, 4);
});

test("totali: versamenti né entrate né uscite", () => {
  assert.deepEqual(totali(appiattisci(cat)), { entrate: 1800, uscite: 42.4, saldo: 1757.6 });
});

test("raggruppa per giorno con etichette", () => {
  const oggi = new Date(2026, 10, 20);
  const g = perGiorno(appiattisci(cat), oggi);
  assert.deepEqual(g.map((x) => [x.etichetta, x.movimenti.length]), [["Oggi", 2], ["Martedì 3 novembre", 1], ["Domenica 1 novembre", 1]]);
  assert.equal(etichettaGiorno("2026-11-19", oggi), "Ieri");
});
