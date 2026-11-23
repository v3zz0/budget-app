'use strict';

const fs = require('fs');
const sharp = require('sharp');

const MAX_BYTES = 10 * 1024 * 1024;
const TIPI = ['image/jpeg', 'image/png', 'image/webp'];
const USER = 'plugin::users-permissions.user';

// Foto profilo: ritagliata quadrata al centro e ridotta a 256x256 in JPEG SUL
// SERVER (progetto.md §13). Il ritaglio nel browser è solo un'anteprima: qui si
// rifà comunque, perché il client può mandare qualunque cosa.
module.exports = {
  async caricaFoto(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    const f = ctx.request.files?.foto;
    const file = Array.isArray(f) ? f[0] : f;
    try {
      if (!file) return ctx.badRequest('Nessuna foto caricata (campo "foto")');
      if (file.size > MAX_BYTES) return ctx.badRequest('La foto supera i 10 MB');
      if (!TIPI.includes(file.mimetype || file.type)) return ctx.badRequest('Formato non supportato: usa JPG, PNG o WEBP');
      let jpeg;
      try {
        jpeg = await sharp(await fs.promises.readFile(file.filepath || file.path), { limitInputPixels: 50e6 })
          .rotate() // EXIF: la foto del telefono resta dritta
          .resize(256, 256, { fit: 'cover', position: 'centre' })
          .flatten({ background: '#ffffff' }) // PNG trasparenti
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {
        return ctx.badRequest('Il file non è un\'immagine leggibile');
      }
      const avatar = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      await strapi.db.query(USER).update({ where: { id: utente.id }, data: { avatar } });
      ctx.body = { avatar };
    } finally {
      // Mai su disco da noi: formidable la scrive in tmp, la togliamo subito.
      if (file) fs.promises.unlink(file.filepath || file.path).catch(() => {});
    }
  },

  async rimuoviFoto(ctx) {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();
    await strapi.db.query(USER).update({ where: { id: utente.id }, data: { avatar: null } });
    ctx.body = { avatar: null };
  },
};
