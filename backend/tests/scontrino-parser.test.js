'use strict';

// Check del parser degli scontrini: node tests/scontrino-parser.test.js
// Portato da test/scontrino_service_test.dart dell'app Flutter, caso per caso.
// Le righe arrivano già ordinate per y, come le prepara services/ocr.js.

const assert = require('node:assert');
const { estrai } = require('../src/api/scontrino/services/parser')();

const R = (testo, y, h) => ({ testo, y, h });

// scontrino normale: totale sulla stessa riga
{
  const d = estrai([
    R('CONAD CITY', 10, 20), R('VIA ROMA 12', 40, 20), R('PANE 1,20', 100, 20),
    R('LATTE 2,30', 130, 20), R('SUBTOTALE 3,50', 160, 20), R('TOTALE EURO 3,50', 190, 20),
    R('CONTANTE 10,00', 220, 20), R('RESTO 6,50', 250, 20),
  ]);
  assert.strictEqual(d.totale, 3.5);
  assert.strictEqual(d.descrizione, 'CONAD CITY');
}

// scontrino largo: importo in un'altra riga alla stessa altezza
{
  const d = estrai([R('ESSELUNGA SPA', 10, 25), R('TOTALE COMPLESSIVO', 200, 25), R('24,90', 203, 25)]);
  assert.strictEqual(d.totale, 24.9);
}

// ignora IVA, subtotale e conteggio articoli
{
  const d = estrai([
    R('MARKET', 10, 20), R('TOTALE ARTICOLI 5', 100, 20), R('SUBTOTALE 9,00', 130, 20),
    R('TOTALE 8,00', 160, 20), R('TOTALE IVA 22% 1,44', 190, 20),
  ]);
  assert.strictEqual(d.totale, 8);
}

// separatore delle migliaia, IT e EN
assert.strictEqual(estrai([R('TOTALE 1.234,56', 100, 20)]).totale, 1234.56);
assert.strictEqual(estrai([R('TOTALE 1,234.56', 100, 20)]).totale, 1234.56);

// nessun totale riconosciuto: null, non un numero a caso (il CONTANTE non è il totale)
assert.strictEqual(estrai([R('SCONTRINO ILLEGGIBILE', 10, 20), R('CONTANTE 50,00', 100, 20)]).totale, null);

// scontrino vuoto
{
  const d = estrai([]);
  assert.strictEqual(d.totale, null);
  assert.strictEqual(d.descrizione, null);
}

// colonna dei prezzi leggermente disallineata (scontrino Sigma, fotografato in mano):
// sbandamento di 14px, più di h/2 e meno di 1,5h
assert.strictEqual(
  estrai([R('TOTALE COMPLESSIVO', 1000, 20), R('20,12', 1014, 20), R('DI CUI IVA', 1040, 20), R('2,83', 1054, 20)]).totale,
  20.12
);

// fra due candidati vince quello alla stessa altezza
assert.strictEqual(
  estrai([R('TOTALE COMPLESSIVO', 1000, 20), R('20,12', 1005, 20), R('2,83', 1028, 20)]).totale,
  20.12
);

// se la dicitura buona non aggancia, ripiega su IMPORTO PAGATO e non su PAGAMENTO CONTANTE
assert.strictEqual(
  estrai([
    R('TOTALE COMPLESSIVO', 1000, 20), R('PAGAMENTO CONTANTE 50,00', 1100, 20),
    R('RESTO 29,88', 1140, 20), R('IMPORTO PAGATO 20,12', 1180, 20),
  ]).totale,
  20.12
);

// il testo letto torna sempre indietro, anche quando non trova nulla
{
  const d = estrai([R('SUPERMERCATI SIGMA', 100, 20), R('roba illeggibile', 140, 20)]);
  assert.strictEqual(d.totale, null);
  assert.deepStrictEqual(d.righeLette, ['SUPERMERCATI SIGMA', 'roba illeggibile']);
}

// la regex degli importi è globale: chiamate ripetute non devono "ricordare" la
// posizione della precedente (bug classico di RegExp con flag g in JS)
for (let i = 0; i < 3; i++) {
  assert.strictEqual(estrai([R('TOTALE 3,50', 10, 20)]).totale, 3.5);
}

console.log('OK: parser scontrino');
