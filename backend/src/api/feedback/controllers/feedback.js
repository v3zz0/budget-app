'use strict';

const fs = require('fs');

const TIPI = ['problema', 'idea', 'altro'];
const IMMAGINI = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;

// "Invia feedback" (progetto.md §20). L'utente lo mette il server; lo
// screenshot va nella Media Library di Strapi (si vede dall'admin: /uploads
// non è esposto da nginx, sta solo sulla porta del pannello).
module.exports = {
  async invia(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    const b = ctx.request.body || {};
    const f = ctx.request.files?.screenshot;
    const file = Array.isArray(f) ? f[0] : f;
    try {
      const tipo = TIPI.includes(b.tipo) ? b.tipo : null;
      const messaggio = String(b.messaggio || '').trim();
      if (!tipo) return ctx.badRequest('Scegli di cosa si tratta');
      if (messaggio.length < 10) return ctx.badRequest('Scrivi almeno 10 caratteri');
      if (messaggio.length > 1000) return ctx.badRequest('Al massimo 1000 caratteri');
      if (file && (file.size > MAX_BYTES || !IMMAGINI.includes(file.mimetype || file.type))) {
        return ctx.badRequest('Lo screenshot deve essere un\'immagine fino a 10 MB');
      }

      let screenshot = null;
      if (file) {
        const [caricato] = await strapi.plugin('upload').service('upload').upload({
          data: { fileInfo: { name: `feedback-${utente.id}-${Date.now()}`, alternativeText: 'Screenshot del feedback' } },
          files: file,
        });
        screenshot = caricato?.id ?? null;
      }
      await strapi.db.query('api::feedback.feedback').create({
        data: {
          tipo,
          messaggio,
          contesto: String(b.contesto || '').slice(0, 300) || null,
          rispondi: b.rispondi !== 'false' && b.rispondi !== false,
          utente: utente.id,
          stato: 'nuovo',
          ...(screenshot && { screenshot }),
        },
      });
      ctx.status = 201;
      ctx.body = { ok: true };
    } finally {
      // Il file temporaneo di formidable: la Media Library ne ha già fatto copia
      if (file) fs.promises.unlink(file.filepath || file.path).catch(() => {});
    }
  },
};
