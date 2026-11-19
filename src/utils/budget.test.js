// node --test src/utils/
import test from "node:test";
import assert from "node:assert/strict";
import {
  primoDelMese, ultimoDelMese, spostaMese, dataIt, euro, proiezioneFineMese,
} from "./budget.js";

test("chiavi mese", () => {
  assert.equal(primoDelMese(2026, 8), "2026-08-01");
  assert.equal(ultimoDelMese(2026, 2), "2026-02-28");
  assert.equal(ultimoDelMese(2028, 2), "2028-02-29"); // bisestile
  assert.equal(ultimoDelMese(2026, 12), "2026-12-31");
});

test("spostaMese attraversa l'anno", () => {
  assert.deepEqual(spostaMese({ anno: 2026, mese: 1 }, -1), { anno: 2025, mese: 12 });
  assert.deepEqual(spostaMese({ anno: 2026, mese: 12 }, 1), { anno: 2027, mese: 1 });
});

test("formati", () => {
  assert.equal(dataIt("2026-08-05"), "05/08/2026");
  assert.equal(euro(120), "€120");
  assert.equal(euro(-120), "−€120");
  assert.equal(euro(12.5, 2), "€12.50");
});

test("proiezione", () => {
  const meseCorrente = { anno: 2026, mese: 9 }; // 30 giorni
  const giorno10 = new Date(2026, 8, 10);
  assert.equal(proiezioneFineMese(100, meseCorrente, giorno10), 300);
  assert.equal(proiezioneFineMese(0, meseCorrente, giorno10), null);
  assert.equal(proiezioneFineMese(100, { anno: 2026, mese: 8 }, giorno10), null);
  assert.equal(proiezioneFineMese(100, meseCorrente, new Date(2026, 8, 30)), 100);
});
