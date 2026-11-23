'use strict';

// Tolleranza per matching importo (centesimi)
const TOLL_IMPORTO = 0.01;
// Finestra temporale per matching (giorni)
const TOLL_GIORNI = 3;

function diffGiorni(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.abs((a - b) / (1000 * 60 * 60 * 24));
}

const { parole } = require('./auto-categoria')();

// Tipo di una transazione del DB: dalla sua categoria (senza = uscita).
const tipoDB = (t) => t.categorie?.Tipo || 'uscita';
const tipoBanca = (t) => t.tipo || 'uscita';
// Stessa descrizione "a occhio": almeno una parola significativa in comune.
// Le parole di auto-categoria (4+ lettere, niente rumore bancario) più quelle
// di 3 lettere, perché molti marchi sono corti ("Pieno Eni" ↔ "POS ENI 1234").
const CORTE_RUMORE = new Set(['POS', 'EUR', 'VIA', 'DEL', 'DAL', 'PER', 'CON', 'SRL', 'SPA', 'SAS', 'SNC', 'THE', 'AND', 'NOV', 'DIC', 'GEN']);
function chiavi(s) {
  const out = parole(s);
  for (const p of String(s || '').toUpperCase().replace(/[^A-ZÀ-Ù]+/g, ' ').split(' ')) {
    if (p.length === 3 && !CORTE_RUMORE.has(p)) out.add(p);
  }
  return out;
}
function simili(a, b) {
  const pa = chiavi(a);
  for (const p of chiavi(b)) if (pa.has(p)) return true;
  return false;
}

module.exports = () => ({
  /**
   * Confronta i movimenti della banca con le transazioni del DB (progetto.md §10).
   * Un movimento si abbina solo a una transazione dello stesso tipo
   * (addebito ↔ uscita, accredito ↔ entrata).
   *
   *   abbinati: stesso importo (±0,01) entro 3 giorni           [{ banca, app }]
   *   diversi:  stesso movimento (entro 3 giorni, descrizione
   *             simile) ma cifra diversa                          [{ banca, app }]
   *   mancanti: in banca, non nell'app                            [banca]
   *   soloApp:  nell'app, non in banca                            [app]
   *
   * Chi chiama toglie prima le transazioni in contanti: non passano dal conto.
   */
  confronta(transazioniBanca, transazioniDB) {
    const usate = new Set();
    const abbinati = [];
    const restano = [];

    for (const b of transazioniBanca) {
      const idx = transazioniDB.findIndex((t, i) =>
        !usate.has(i) &&
        tipoDB(t) === tipoBanca(b) &&
        Math.abs(Number(t.Importo) - Number(b.importo)) < TOLL_IMPORTO &&
        diffGiorni(t.Data, b.data) <= TOLL_GIORNI);
      if (idx >= 0) {
        usate.add(idx);
        abbinati.push({ banca: b, app: transazioniDB[idx] });
      } else {
        restano.push(b);
      }
    }

    const diversi = [];
    const mancanti = [];
    for (const b of restano) {
      const idx = transazioniDB.findIndex((t, i) =>
        !usate.has(i) &&
        tipoDB(t) === tipoBanca(b) &&
        diffGiorni(t.Data, b.data) <= TOLL_GIORNI &&
        simili(t.Descrizione, b.descrizione));
      if (idx >= 0) {
        usate.add(idx);
        diversi.push({ banca: b, app: transazioniDB[idx] });
      } else {
        mancanti.push(b);
      }
    }

    const soloApp = transazioniDB.filter((_, i) => !usate.has(i));
    return { abbinati, diversi, mancanti, soloApp };
  },

  // Calcola sforamenti per categoria del wallet
  calcolaSforamenti(transazioniDB, categorie) {
    return categorie.map((cat) => {
      const speso = transazioniDB
        .filter((t) => t.categorie?.documentId === cat.documentId)
        .reduce((sum, t) => sum + Number(t.Importo), 0);

      const budget = Number(cat.Budget_categoria) || 0;
      const rimanente = budget - speso;

      return {
        documentId: cat.documentId,
        nome: cat.Nome,
        icona: cat.icona,
        budget,
        speso: Number(speso.toFixed(2)),
        rimanente: Number(rimanente.toFixed(2)),
        sforato: rimanente < 0,
      };
    });
  },
});
