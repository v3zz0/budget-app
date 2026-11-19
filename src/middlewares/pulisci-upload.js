'use strict';

// Strapi (formidable) scrive i file di una richiesta multipart in tmp PRIMA
// dell'autenticazione, e non li cancella se la richiesta viene respinta prima
// di arrivare al controller (403 per un permesso mancante, 401, 400...).
// Senza questo, ogni foto di scontrino inviata con il permesso non ancora
// abilitato resterebbe su disco, e un anonimo potrebbe riempire il disco a
// forza di upload respinti. Qui si ripulisce comunque, a risposta data.
//
// Va registrato DOPO strapi::body in config/middlewares.js: deve stare
// "dentro" il parser per vedere i file, e il suo finally scatta a richiesta chiusa.

const fs = require('fs');

module.exports = () => async (ctx, next) => {
  try {
    await next();
  } finally {
    for (const f of Object.values(ctx.request.files ?? {}).flat()) {
      fs.promises.unlink(f.filepath || f.path).catch(() => {}); // già cancellato dal controller: ok
    }
  }
};
