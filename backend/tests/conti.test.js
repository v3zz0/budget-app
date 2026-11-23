'use strict';
// node tests/conti.test.js — l'esempio di progetto.md §12 (lo stesso del frontend)
const assert = require('node:assert');
const { bilancio, effetto, saldoCassa, quotaRegola } = require('../src/conti');

// Thomas ha creato il portafoglio, Francesca è il membro. Novembre, a metà.
const ESEMPIO = [
  { tipo: 'uscita', importo: 800, pagatoDa: 'membro', quota: 0.5 }, // affitto      −400
  { tipo: 'uscita', importo: 132.4, pagatoDa: 'creatore', quota: 0.5 }, // spesa   +66,20
  { tipo: 'uscita', importo: 18.6, pagatoDa: 'membro', quota: 0.5 }, // detersivi    −9,30
  { tipo: 'entrata', importo: 60, pagatoDa: 'membro', quota: 0.5 }, // conguaglio    +30
  { tipo: 'uscita', importo: 84, pagatoDa: 'creatore', quota: 0.5 }, // cena          +42
  { tipo: 'uscita', importo: 45, pagatoDa: 'creatore', quota: 0 }, // fiori, tutti di F. +45
  { tipo: 'uscita', importo: 96.3, pagatoDa: 'cassa', quota: 0.5, quotaCassa: 0.5 }, // luce  0
  { tipo: 'uscita', importo: 41.7, pagatoDa: 'cassa', quota: 0.5, quotaCassa: 0.5 }, // mercato 0
  { tipo: 'versamento', importo: 300, pagatoDa: 'creatore', quotaCassa: 0.5 }, //      0 (+150 di F. dopo)
  { tipo: 'versamento', importo: 300, pagatoDa: 'membro', quotaCassa: 0.5 },
];
assert.strictEqual(bilancio(ESEMPIO), -226.1, 'devi €226,10 a Francesca');
assert.strictEqual(saldoCassa(ESEMPIO), 462, '600 versati − 138 spesi dalla cassa');

// Centesimi: la parte del creatore arrotondata, all'altro il resto
assert.strictEqual(effetto({ tipo: 'uscita', importo: 10.01, pagatoDa: 'creatore', quota: 0.5 }), 5, '10,01 a metà: 5,01 mia, 5,00 sua');
assert.strictEqual(effetto({ tipo: 'uscita', importo: 10.01, pagatoDa: 'membro', quota: 0.5 }), -5.01);
// Rimborso: chi dà soldi all'altro riduce il debito
assert.strictEqual(bilancio([...ESEMPIO, { tipo: 'rimborso', importo: 226.1, pagatoDa: 'creatore' }]), 0, 'Salda → pari');
// Una spesa della cassa divisa come la regola non sposta il conto
assert.strictEqual(effetto({ tipo: 'uscita', importo: 100, pagatoDa: 'cassa', quota: 0.6, quotaCassa: 0.6 }), 0);

assert.strictEqual(quotaRegola({ regolaTipo: 'meta' }), 0.5);
assert.strictEqual(quotaRegola({ regolaTipo: 'proporzionale', entrateCreatore: 2400, entrateMembro: 1800 }), 0.57);
assert.strictEqual(quotaRegola({ regolaTipo: 'personalizzata', quotaCreatore: 1.4 }), 1);
console.log('OK: conto tra voi (esempio §12: −226,10)');
