'use strict';

// OCR degli scontrini con tesseract.js (WASM: nessuna dipendenza di sistema,
// funziona anche su alpine). La foto passa solo in memoria: non si salva e non
// si manda a nessun servizio esterno. Anche il modello della lingua è locale
// (@tesseract.js-data/ita): il server non scarica niente da una CDN.

const path = require('path');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

const LANG_PATH = path.join(
  path.dirname(require.resolve('@tesseract.js-data/ita/package.json')),
  '4.0.0_best_int'
);

// Larghezza a cui si riduce la foto. Una foto da 12MP non legge meglio e costa
// molto di più; sotto i 2000px il testo piccolo di uno scontrino si sfoca.
const LARGHEZZA_MAX = 2000;
const TIMEOUT_MS = 60_000;
// Il worker tiene un centinaio di MB: dopo un po' senza richieste si libera.
const IDLE_MS = 5 * 60_000;
// Una lettura alla volta (è CPU pura). Oltre questo numero fra in corso e in
// coda si rifiuta subito: meglio un 429 che una fila di richieste che
// scadono tutte insieme.
const MAX_RICHIESTE = 3;

// Stato a livello di modulo e non della factory: il worker è uno solo per
// processo, comunque la si istanzi.
let worker = null; // promessa del worker, creato al primo uso
let coda = Promise.resolve();
let richieste = 0;
let idle = null;

const errore = (codice, messaggio) => Object.assign(new Error(messaggio), { codice });

function getWorker() {
  worker ??= createWorker('ita', 1, { langPath: LANG_PATH, cacheMethod: 'none' }).catch((e) => {
    worker = null; // un caricamento fallito non deve restare in cache
    throw e;
  });
  return worker;
}

async function spegni() {
  const w = worker;
  worker = null;
  if (w) await (await w.catch(() => null))?.terminate().catch(() => {});
}

// Raddrizza (la rotazione EXIF dei telefoni), riduce, scala di grigi e
// contrasto. Se sharp non riconosce l'immagine il file non è una foto.
async function prepara(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: LARGHEZZA_MAX, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();
  } catch {
    throw errore('IMMAGINE', 'Il file non è un\'immagine leggibile');
  }
}

async function esegui(buffer) {
  clearTimeout(idle);
  try {
    const img = await prepara(buffer);
    const w = await getWorker();

    let timer;
    const lettura = w.recognize(img, {}, { blocks: true });
    lettura.catch(() => {}); // se scade, l'errore tardivo non deve diventare unhandled
    const scaduto = new Promise((_, no) => {
      timer = setTimeout(() => no(errore('TIMEOUT', 'Lettura troppo lunga')), TIMEOUT_MS);
    });
    try {
      const { data } = await Promise.race([lettura, scaduto]);
      return righeDa(data);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Un worker che ha sforato il tempo può essere rimasto in uno stato
    // incerto: si butta e il prossimo ne crea uno nuovo.
    if (e.codice === 'TIMEOUT') await spegni();
    throw e;
  } finally {
    idle = setTimeout(spegni, IDLE_MS);
    idle.unref();
  }
}

// blocks -> paragrafi -> righe, con la posizione verticale: serve al parser
// per riappaiare "TOTALE" e il suo importo quando sono in righe separate.
function righeDa(data) {
  const righe = [];
  for (const blocco of data.blocks ?? []) {
    for (const par of blocco.paragraphs ?? []) {
      for (const l of par.lines ?? []) {
        const testo = (l.text ?? '').trim();
        if (!testo) continue;
        righe.push({ testo, y: (l.bbox.y0 + l.bbox.y1) / 2, h: l.bbox.y1 - l.bbox.y0 });
      }
    }
  }
  return righe.sort((a, b) => a.y - b.y);
}

module.exports = () => ({
  /** buffer di un'immagine -> righe [{testo, y, h}] ordinate dall'alto. */
  leggiRighe(buffer) {
    if (richieste >= MAX_RICHIESTE) {
      return Promise.reject(errore('OCCUPATO', 'Troppe letture in corso'));
    }
    richieste++;
    const turno = coda.then(() => esegui(buffer));
    coda = turno.catch(() => {}); // un errore non blocca chi viene dopo
    return turno.finally(() => richieste--);
  },

  /** Libera il worker (test e chiusura del server). */
  spegni,
});
