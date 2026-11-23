import { test } from "node:test";
import assert from "node:assert/strict";
import { eur } from "./formato.js";

test("eur: migliaia, decimali, segni", () => {
  assert.equal(eur(1388), "€1.388,00");
  assert.equal(eur(-74), "−€74,00");
  assert.equal(eur(150, { segno: true }), "+€150,00");
  assert.equal(eur(1200, { corto: true }), "€1.200");
  assert.equal(eur(112.5, { corto: true }), "€112,50");
});
