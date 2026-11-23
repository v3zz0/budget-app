import test from "node:test";
import assert from "node:assert/strict";
import { chiave, daControllare } from "./analisi.js";

test("incongruenze da controllare: le chiuse escono dal conto", () => {
  const report = {
    mancanti: [{ data: "2026-11-08", importo: 150, descrizione: "BONIFICO" }],
    soloApp: [{ documentId: "x", importo: 74 }],
    diversi: [{ app: { documentId: "y" }, banca: {} }],
  };
  assert.equal(daControllare(report, new Set()), 3);
  assert.equal(daControllare(report, new Set([chiave(report.soloApp[0]), chiave(report.diversi[0])])), 1);
});
