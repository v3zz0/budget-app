import test from "node:test";
import assert from "node:assert/strict";
import { meseDaCuiPrendere, piano } from "./piano.js";

test("piano con obiettivo: quanti versamenti e quando si arriva", () => {
  const p = piano({ importo: 150, saldo: 2000, obiettivo: 8000, ricorrente: true, data: "2026-11-23", oggi: "2026-11-23" });
  assert.equal(p.versamenti, 40);
  assert.equal(p.arrivo, "febbraio 2030");
  assert.equal(p.primoOggi, true);
  assert.equal(p.meseCorto, false);
});

test("senza obiettivo: quanto in un anno; dal 29 avviso dei mesi corti; futuro", () => {
  const p = piano({ importo: 100, ricorrente: true, data: "2026-12-30", oggi: "2026-11-23" });
  assert.equal(p.inUnAnno, 1200);
  assert.equal(p.meseCorto, true);
  assert.equal(p.primoOggi, false);
  assert.equal(piano({ importo: 100, saldo: 900, obiettivo: 800, ricorrente: true, data: "2026-11-23", oggi: "2026-11-23" }).raggiunto, true);
});

test("da quale mese prendere: l'ultimo chiuso che basta", () => {
  const mesi = [{ mese: "2026-11", disponibile: 900 }, { mese: "2026-10", disponibile: 120 }, { mese: "2026-09", disponibile: 400 }];
  assert.equal(meseDaCuiPrendere(mesi, "2026-11", 100), "2026-10", "il mese in corso non conta");
  assert.equal(meseDaCuiPrendere(mesi, "2026-11", 300), "2026-09");
  assert.equal(meseDaCuiPrendere(mesi, "2026-11", 500), null);
});
