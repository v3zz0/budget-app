'use strict';

// Check end-to-end dell'OCR: node tests/scontrino-ocr.test.js
// Genera uno scontrino finto con sharp (SVG -> PNG), lo fa leggere dal vero
// worker tesseract e verifica il totale. Il testo SVG usa un font di sistema
// (monospace): su una macchina senza font il check non può funzionare.

const assert = require('node:assert');
const sharp = require('sharp');
const ocr = require('../src/api/scontrino/services/ocr')();
const parser = require('../src/api/scontrino/services/parser')();

const RIGHE = [
  ['CONAD CITY', ''], ['VIA ROMA 12 MILANO', ''], ['', ''],
  ['PANE', '1,20'], ['LATTE INTERO', '2,30'], ['PASTA 500G', '1,49'],
  ['SUBTOTALE', '4,99'], ['TOTALE EURO', '4,99'], ['', ''],
  ['CONTANTE', '10,00'], ['RESTO', '5,01'],
];

async function scontrino() {
  const W = 700;
  const H = 60 + 44 * RIGHE.length;
  const testo = RIGHE.map(([a, b], i) => {
    const y = 55 + 44 * i;
    return `<text x="30" y="${y}">${a}</text>` +
      (b ? `<text x="${W - 30}" y="${y}" text-anchor="end">${b}</text>` : '');
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="white"/>
    <g font-family="monospace" font-size="30" fill="black">${testo}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

(async () => {
  try {
    const foto = await scontrino();

    const d = parser.estrai(await ocr.leggiRighe(foto));
    assert.strictEqual(d.totale, 4.99, `totale letto: ${d.totale}; righe: ${JSON.stringify(d.righeLette)}`);
    assert.strictEqual(d.descrizione, 'CONAD CITY');

    // Non è un'immagine: rifiutato con il codice che il controller traduce in 400.
    await assert.rejects(ocr.leggiRighe(Buffer.from('non sono una foto')), { codice: 'IMMAGINE' });

    // Oltre 3 letture fra in corso e in coda: le altre si rifiutano subito (429).
    const esiti = await Promise.allSettled(Array.from({ length: 5 }, () => ocr.leggiRighe(foto)));
    assert.strictEqual(esiti.filter((e) => e.status === 'fulfilled').length, 3);
    assert.ok(esiti.filter((e) => e.status === 'rejected').every((e) => e.reason.codice === 'OCCUPATO'));

    console.log('OK: OCR scontrino (totale, immagine non valida, limite di richieste)');
  } finally {
    await ocr.spegni();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
