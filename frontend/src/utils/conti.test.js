import test from "node:test";
import assert from "node:assert/strict";
import { bilancio, effetto, miaQuota, quotaRegola, saldoCassa, ultimoPareggio } from "./conti.js";

// progetto.md §12: Thomas ha creato il portafoglio, Francesca è il membro.
const ESEMPIO = [
  { tipo: "uscita", importo: 800, pagatoDa: "membro", quota: 0.5 }, // affitto −400
  { tipo: "uscita", importo: 132.4, pagatoDa: "creatore", quota: 0.5 }, // spesa +66,20
  { tipo: "uscita", importo: 18.6, pagatoDa: "membro", quota: 0.5 }, // detersivi −9,30
  { tipo: "entrata", importo: 60, pagatoDa: "membro", quota: 0.5 }, // conguaglio +30
  { tipo: "uscita", importo: 84, pagatoDa: "creatore", quota: 0.5 }, // cena +42
  { tipo: "uscita", importo: 45, pagatoDa: "creatore", quota: 0 }, // fiori, tutti di Francesca +45
  { tipo: "uscita", importo: 96.3, pagatoDa: "cassa", quota: 0.5, quotaCassa: 0.5 }, // luce 0
  { tipo: "uscita", importo: 41.7, pagatoDa: "cassa", quota: 0.5, quotaCassa: 0.5 }, // mercato 0
  { tipo: "versamento", importo: 300, pagatoDa: "creatore", quotaCassa: 0.5 },
  { tipo: "versamento", importo: 300, pagatoDa: "membro", quotaCassa: 0.5 },
];

test("esempio di §12: devi €226,10 a Francesca", () => {
  assert.equal(bilancio(ESEMPIO, "creatore"), -226.1);
  assert.equal(bilancio(ESEMPIO, "membro"), 226.1, "Francesca vede lo stesso conto girato");
  assert.equal(saldoCassa(ESEMPIO), 462);
});

test("centesimi: la parte del creatore arrotondata, all'altro il resto", () => {
  assert.equal(effetto({ tipo: "uscita", importo: 10.01, pagatoDa: "creatore", quota: 0.5 }), 5);
  assert.equal(effetto({ tipo: "uscita", importo: 10.01, pagatoDa: "membro", quota: 0.5 }), -5.01);
});

test("Salda: un rimborso porta in pari", () => {
  assert.equal(bilancio([...ESEMPIO, { tipo: "rimborso", importo: 226.1, pagatoDa: "creatore" }]), 0);
});

test("la mia parte e le regole", () => {
  assert.equal(miaQuota(0.7, "creatore"), 0.7);
  assert.equal(miaQuota(0.7, "membro"), 0.3);
  assert.equal(quotaRegola({ regolaTipo: "proporzionale", entrateCreatore: 2400, entrateMembro: 1800 }), 0.57);
});

test("ultimo pareggio: solo quando il conto torna davvero a zero", () => {
  const m = [
    { tipo: "uscita", importo: 100, pagatoDa: "membro", quota: 0.5, data: "2026-11-01" },
    { tipo: "rimborso", importo: 20, pagatoDa: "creatore", data: "2026-11-05" }, // parziale
  ];
  assert.equal(ultimoPareggio(m), null);
  assert.equal(ultimoPareggio([...m, { tipo: "rimborso", importo: 30, pagatoDa: "creatore", data: "2026-11-09" }]), "2026-11-09");
});
