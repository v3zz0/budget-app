'use strict';

const fs = require('fs');

const ocr = require('../services/ocr')();
const parser = require('../services/parser')();

// Oltre questo è quasi certamente un file sbagliato: una foto da telefono
// resta sotto i 10MB.
const MAX_BYTES = 15 * 1024 * 1024;

// ctx.badRequest & co. non coprono 413 e 429: stessa forma { error: {message} }
// che il client già legge per tutti gli altri errori.
function rispondi(ctx, status, name, message) {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
}

module.exports = {
  async leggi(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();

    const caricati = ctx.request.files?.immagine;
    const lista = caricati ? (Array.isArray(caricati) ? caricati : [caricati]) : [];

    try {
      if (!lista.length) return ctx.badRequest('Nessuna immagine caricata (campo "immagine")');
      const file = lista[0];
      if (file.size > MAX_BYTES) {
        return rispondi(ctx, 413, 'PayloadTooLargeError', 'L\'immagine è troppo grande');
      }

      const buffer = await fs.promises.readFile(file.filepath || file.path);
      const righe = await ocr.leggiRighe(buffer);
      return parser.estrai(righe);
    } catch (e) {
      if (e.codice === 'IMMAGINE') return ctx.badRequest(e.message);
      if (e.codice === 'OCCUPATO') {
        return rispondi(ctx, 429, 'TooManyRequestsError', 'Troppe letture in corso, riprova fra qualche secondo');
      }
      if (e.codice === 'TIMEOUT') {
        return rispondi(ctx, 504, 'GatewayTimeoutError', 'La lettura ha impiegato troppo: riprova con una foto più piccola');
      }
      // Mai il contenuto della foto o del testo letto nei log: sono dati dell'utente.
      strapi.log.error(`Scontrino: lettura fallita (${e.message})`);
      return ctx.internalServerError('Lettura dello scontrino non riuscita');
    } finally {
      // La foto non deve restare su disco: formidable la scrive in tmp e
      // Strapi non la pulisce da solo.
      for (const f of lista) fs.promises.unlink(f.filepath || f.path).catch(() => {});
    }
  },
};
