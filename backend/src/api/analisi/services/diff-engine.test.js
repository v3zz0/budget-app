'use strict';
// Check minimo: node src/api/analisi/services/diff-engine.test.js
const assert = require('assert');
const diff = require('./diff-engine')();

// Banca ha un movimento da 50€ non registrato. Nel DB c'è una spesa in contanti
// dello stesso importo e data: senza il filtro Contanti farebbe match con quel
// movimento e il mancante sparirebbe dal report.
const banca = [{ importo: 50, data: '2026-03-10', descrizione: 'POS ignoto' }];
const db = [{ Importo: 50, Data: '2026-03-10', Contanti: true }];

assert.strictEqual(diff.confronta(banca, db).mancanti.length, 0, 'senza filtro il contante maschera il mancante');

const filtrate = db.filter((t) => !t.Contanti);
assert.strictEqual(diff.confronta(banca, filtrate).mancanti.length, 1, 'con filtro il mancante emerge');

// Una spesa tracciata (non contanti) deve invece continuare a fare match.
const tracciata = [{ Importo: 50, Data: '2026-03-10', Contanti: false }];
assert.strictEqual(diff.confronta(banca, tracciata.filter((t) => !t.Contanti)).mancanti.length, 0);

// Quattro elenchi, entrate comprese (progetto.md §10)
{
  const banca = [
    { importo: 32.4, data: '2026-11-12', descrizione: 'POS ESSELUNGA MILANO' },
    { importo: 121.5, data: '2026-11-10', descrizione: 'POS ENI STATION 1234' },
    { importo: 150, data: '2026-11-08', descrizione: 'BONIFICO DA MARCO ROSSI', tipo: 'entrata' },
    { importo: 1800, data: '2026-11-27', descrizione: 'RETRIBUZIONE NOVEMBRE', tipo: 'entrata' },
  ];
  const cat = (Tipo) => ({ Tipo });
  const app = [
    { Importo: 32.4, Data: '2026-11-13', Descrizione: 'Esselunga', categorie: cat('uscita') },
    { Importo: 112, Data: '2026-11-10', Descrizione: 'Pieno Eni', categorie: cat('uscita') },
    { Importo: 74, Data: '2026-11-14', Descrizione: 'Concerto', categorie: cat('uscita') },
    { Importo: 1800, Data: '2026-11-27', Descrizione: 'Stipendio', categorie: cat('entrata') },
    // stessa cifra e data dell'accredito di Marco, ma è un'uscita: non si abbina
    { Importo: 150, Data: '2026-11-08', Descrizione: 'Regalo', categorie: cat('uscita') },
  ];
  const r = diff.confronta(banca, app);
  assert.deepStrictEqual(r.abbinati.map((x) => x.app.Descrizione), ['Esselunga', 'Stipendio']);
  assert.deepStrictEqual(r.diversi.map((x) => [x.app.Importo, x.banca.importo]), [[112, 121.5]], 'Eni: importo diverso');
  assert.deepStrictEqual(r.mancanti.map((x) => x.descrizione), ['BONIFICO DA MARCO ROSSI'], 'l\'accredito non si abbina a un\'uscita');
  assert.deepStrictEqual(r.soloApp.map((x) => x.Descrizione).sort(), ['Concerto', 'Regalo']);
}

console.log('ok');
