'use strict';
// node tests/csv-parser.test.js
const assert = require('node:assert');
const parser = require('../src/api/analisi/services/csv-parser')();

const semplice = parser.parse('Data;Descrizione;Importo\n12/11/2026;POS ESSELUNGA;-32,40\n08/11/2026;"BONIFICO DA ROSSI; MARCO";+150,00\n27/11/2026;STIPENDIO;1.800,00\n');
assert.deepStrictEqual(semplice.map((m) => [m.data, m.importo, m.tipo || 'uscita']), [
  ['2026-11-12', 32.4, 'uscita'], ['2026-11-08', 150, 'entrata'], ['2026-11-27', 1800, 'entrata'],
]);
assert.strictEqual(semplice[1].descrizione, 'BONIFICO DA ROSSI; MARCO', 'separatore dentro le virgolette');

const dareAvere = parser.parse('data,descrizione,dare,avere\n2026-11-10,ENI,121.50,\n2026-11-11,RIMBORSO,,20\n');
assert.deepStrictEqual(dareAvere.map((m) => [m.importo, m.tipo || 'uscita']), [[121.5, 'uscita'], [20, 'entrata']]);

assert.deepStrictEqual(parser.parse('qualcosa che non è un csv\nriga'), [], 'senza intestazione: niente, passa all\'LLM');
console.log('OK: csv generico');
