// npm test
import test from "node:test";
import assert from "node:assert/strict";
import { prossimaScadenza, quando } from "./ricorrenza.js";

const iso = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const giorno = (Data, oggi, extra = {}) => iso(prossimaScadenza({ Data, ...extra }, oggi));

test("clamp sui mesi corti", () => {
  assert.equal(giorno("2026-01-31", new Date(2026, 1, 10)), "2026-2-28");
  assert.equal(giorno("2026-01-31", new Date(2028, 1, 10)), "2028-2-29"); // bisestile
});

test("oggi conta come scadenza", () => {
  assert.equal(giorno("2026-01-31", new Date(2026, 1, 28)), "2026-2-28");
  assert.equal(giorno("2026-01-15", new Date(2026, 5, 15)), "2026-6-15");
});

test("giorno già passato -> mese dopo, anche oltre l'anno", () => {
  assert.equal(giorno("2026-01-31", new Date(2026, 2, 1)), "2026-3-31");
  assert.equal(giorno("2026-01-15", new Date(2026, 11, 16)), "2027-1-15");
});

test("RicorrenzaTemporale ha la precedenza su Data", () => {
  assert.equal(giorno("2026-01-05", new Date(2026, 5, 1), { RicorrenzaTemporale: "2026-01-20" }), "2026-6-20");
});

test("quando", () => {
  const oggi = new Date(2026, 8, 10);
  assert.equal(quando(new Date(2026, 8, 10), oggi), "oggi");
  assert.equal(quando(new Date(2026, 8, 11), oggi), "domani");
  assert.equal(quando(new Date(2026, 8, 13), oggi), "fra 3 giorni");
  assert.equal(quando(new Date(2026, 8, 25), oggi), "il 25 set");
});
