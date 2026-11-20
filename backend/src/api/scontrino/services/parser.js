'use strict';

// Estrae totale e negozio dalle righe lette dall'OCR di uno scontrino.
// Parte PURA: niente immagini, niente tesseract, quindi testabile
// (tests/scontrino-parser.test.js). Portata da scontrino_service.dart
// dell'app Flutter, test compresi.
//
// Una riga = { testo, y, h }: y è il centro verticale, h l'altezza. Servono
// perché su uno scontrino largo "TOTALE" e "12,50" possono finire in due
// righe distinte alla stessa altezza e vanno riappaiati.

// Un importo ha SEMPRE due decimali. Pretenderli scarta da solo i falsi
// positivi tipo "TOTALE ARTICOLI 5" o il numero di scontrino.
const IMPORTO = /\d{1,6}(?:[.,]\d{3})*[.,]\d{2}/g;

// Righe che contengono "total" ma non sono il totale da pagare.
const ESCLUSI = /SUBTOT|PARZIAL|\bIVA\b|SCONTO|ARTICOL/;

// La dicitura buona: quasi tutti gli scontrini italiani ne hanno una.
const TOTALE = /TOTAL|TOT\./;

// Diciture di riserva, provate solo se la prima passata non trova niente.
// "IMPORTO PAGAT" e non "PAGA", altrimenti prenderebbe "PAGAMENTO CONTANTE",
// che sullo scontrino è quanto hai dato al cassiere: 50 euro per una spesa da
// 20, e finirebbero nel budget così come sono.
const RISERVA = /IMPORTO PAGAT|DA PAGARE|TOT COMPL/;

// Tolleranza verticale, in altezze di riga, per riappaiare dicitura e importo.
// Una volta e mezza e non una: la foto di uno scontrino tenuto in mano è
// sempre un po' storta, e su una colonna distante mezza pagina bastano pochi
// gradi perché il numero giusto esca dalla finestra. Il rischio di pescare la
// riga sotto è coperto dal fatto che vince comunque la più vicina.
// ponytail: se un giorno prendesse il numero della riga sbagliata, la strada
// è confrontare le X (l'importo sta a destra della dicitura), non stringere di
// nuovo la finestra.
const TOLLERANZA_Y = 1.5;

const importi = (testo) => testo.match(IMPORTO) ?? [];

// "12,50", "1.234,56" (IT) o "1,234.56" (EN): l'ultimo separatore è sempre
// quello decimale, gli altri sono migliaia.
function numero(s) {
  const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (i < 0) return null;
  const n = parseFloat(`${s.slice(0, i).replace(/[.,]/g, '')}.${s.slice(i + 1)}`);
  return Number.isNaN(n) ? null : n;
}

function trovaTotale(righe, dicitura) {
  for (let i = 0; i < righe.length; i++) {
    const testo = righe[i].testo.toUpperCase();
    if (!dicitura.test(testo) || ESCLUSI.test(testo)) continue;

    // Caso normale: l'importo è sulla stessa riga.
    const suRiga = importi(testo);
    if (suRiga.length) return numero(suRiga[suRiga.length - 1]);

    // Caso scontrino largo: l'importo è in un'altra riga, alla stessa altezza.
    let vicina = null;
    let distVicina = Infinity;
    for (let j = 0; j < righe.length; j++) {
      if (j === i) continue;
      const dist = Math.abs(righe[j].y - righe[i].y);
      if (dist > righe[i].h * TOLLERANZA_Y) continue;
      if (!importi(righe[j].testo).length) continue;
      if (dist < distVicina) {
        vicina = righe[j];
        distVicina = dist;
      }
    }
    if (vicina) {
      const tutti = importi(vicina.testo);
      return numero(tutti[tutti.length - 1]);
    }
  }
  // ponytail: nessun fallback tipo "prendi il numero più grande": sugli
  // scontrini in contanti il massimo è il CONTANTE, non il totale. Meglio
  // campo vuoto (l'utente lo scrive a mano) che un importo sbagliato che
  // finisce nel budget senza che nessuno se ne accorga.
  return null;
}

// Prima riga leggibile senza cifre: sugli scontrini è l'insegna del negozio.
function trovaDescrizione(righe) {
  for (const riga of righe) {
    const t = riga.testo.trim();
    if (t.length < 3 || /\d/.test(t)) continue;
    return t.length > 30 ? t.slice(0, 30) : t;
  }
  return null;
}

module.exports = () => ({
  /** righe già ordinate per y. */
  estrai(righe) {
    return {
      // Prima la dicitura buona su tutto lo scontrino, poi quelle di riserva:
      // un "TOTALE" letto male non deve far ripiegare su una riga peggiore
      // finché c'è ancora un "TOTALE" più sotto da provare.
      totale: trovaTotale(righe, TOTALE) ?? trovaTotale(righe, RISERVA),
      descrizione: trovaDescrizione(righe),
      // Cosa ha letto l'OCR, riga per riga: quando il totale non salta fuori,
      // senza vederlo si ragiona al buio su una foto che non c'è più.
      righeLette: righe.map((r) => r.testo),
    };
  },
});
