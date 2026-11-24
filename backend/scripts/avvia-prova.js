'use strict';

// Backend di PROVA per guardare l'app nel browser: Strapi vero su SQLite, in
// una cartella app temporanea che punta a src/ e config/ ma SENZA
// database/migrations (la migrazione llamacpp usa MODIFY COLUMN, solo MySQL).
// Crea due utenti, thomas@example.com e francesca@example.com (password
// Prova1234!). Il database resta in .tmp/prova.db tra un avvio e l'altro.
//
//   npm install --no-save better-sqlite3      (una volta)
//   node scripts/avvia-prova.js               (porta 1338, o PORTA=...)
//   cd ../frontend && VITE_PROXY_API=http://127.0.0.1:1338 npx vite
//
// Mai contro il database vero: non legge il .env (variabili impostate qui).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const radice = path.resolve(__dirname, '..');
const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-prova-'));
fs.mkdirSync(path.join(appDir, 'database'));
fs.mkdirSync(path.join(appDir, 'public/uploads'), { recursive: true });
for (const x of ['src', 'config', 'node_modules', 'package.json']) fs.symlinkSync(path.join(radice, x), path.join(appDir, x));
fs.mkdirSync(path.join(radice, '.tmp'), { recursive: true });
process.on('exit', () => fs.rmSync(appDir, { recursive: true, force: true }));

Object.assign(process.env, {
  // relativo: config/database.js lo unisce alla cartella del backend
  DATABASE_CLIENT: 'sqlite', DATABASE_FILENAME: '.tmp/prova.db',
  PORT: process.env.PORTA || '1338', HOST: '127.0.0.1', NODE_ENV: 'development', STRAPI_TELEMETRY_DISABLED: 'true',
  AI_KEYS_SECRET: 'segreto-di-prova', APP_KEYS: 'a,b,c,d', API_TOKEN_SALT: 'x', ADMIN_JWT_SECRET: 'x',
  TRANSFER_TOKEN_SALT: 'x', JWT_SECRET: 'x', ENCRYPTION_KEY: 'x',
});

(async () => {
  const { createStrapi } = require(path.join(radice, 'node_modules/@strapi/strapi'));
  const app = await createStrapi({ appDir, distDir: appDir }).start();
  const ruolo = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  for (const nome of ['thomas', 'francesca']) {
    if (await app.db.query('plugin::users-permissions.user').findOne({ where: { username: nome } })) continue;
    await app.plugin('users-permissions').service('user').add({
      username: nome, email: `${nome}@example.com`, password: 'Prova1234!', provider: 'local', confirmed: true, blocked: false, role: ruolo.id,
    });
  }
  console.log(`PRONTO su ${process.env.PORT}: thomas@example.com / francesca@example.com, password Prova1234!`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
