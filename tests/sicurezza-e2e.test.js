'use strict';

// Check end-to-end della sicurezza multi-utente: node tests/sicurezza-e2e.test.js
//
// Avvia un Strapi VERO su SQLite temporaneo (porta libera, telemetria spenta, il
// tuo database non c'entra) e verifica:
//   1. i permessi del ruolo Authenticated vengono seedati dal bootstrap
//   2. /api/users/* non rivela né tocca altri utenti
//   3. eliminare categoria/portafoglio elimina i figli, senza orfani, a
//      transazione unica, e senza toccare gli altri dati
//   4. un utente non può cancellare i dati di un altro
//   5. con AI_URL_PRIVATI=blocca l'indirizzo AI privato è rifiutato
//
// Richiede un driver SQLite che NON è una dipendenza del progetto (in
// produzione si usa MySQL e non serve compilarlo):
//   npm install --no-save better-sqlite3
//
// La migrazione database/migrations/*llamacpp* usa `MODIFY COLUMN` (solo MySQL):
// per questo l'app gira da una cartella temporanea che punta a src/ e config/
// ma senza migrazioni.

const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const radice = path.resolve(__dirname, '..');

try {
  require.resolve('better-sqlite3', { paths: [radice] });
} catch {
  console.log('SALTATO: manca better-sqlite3 (npm install --no-save better-sqlite3)');
  process.exit(0);
}

const portaLibera = () =>
  new Promise((ok) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

async function main() {
  // Residui delle esecuzioni precedenti: Strapi scrive ancora .strapi-updater.json
  // dopo che il processo è uscito, e quella cartella non si può cancellare in tempo.
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (d.startsWith('budget-e2e-')) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });
  }
  const porta = await portaLibera();
  const dbFile = `.tmp/e2e-sicurezza-${process.pid}.db`;
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-e2e-'));
  fs.mkdirSync(path.join(appDir, 'database'));
  fs.mkdirSync(path.join(appDir, 'public/uploads'), { recursive: true });
  for (const x of ['src', 'config', 'node_modules', 'package.json']) fs.symlinkSync(path.join(radice, x), path.join(appDir, x));
  fs.mkdirSync(path.join(radice, '.tmp'), { recursive: true });
  // Strapi scrive ancora un file (.strapi-updater.json) mentre si spegne, dopo
  // la pulizia nel finally: si ripassa a processo chiuso.
  process.on('exit', () => fs.rmSync(appDir, { recursive: true, force: true }));

  // PRIMA di caricare Strapi: dotenv non sovrascrive le variabili già presenti,
  // quindi neanche un .env con MySQL può prevalere.
  Object.assign(process.env, {
    DATABASE_CLIENT: 'sqlite', DATABASE_FILENAME: dbFile, PORT: String(porta), HOST: '127.0.0.1',
    NODE_ENV: 'development', STRAPI_TELEMETRY_DISABLED: 'true',
    APP_KEYS: 'a,b,c,d', API_TOKEN_SALT: 'x', ADMIN_JWT_SECRET: 'x', TRANSFER_TOKEN_SALT: 'x', JWT_SECRET: 'x', ENCRYPTION_KEY: 'x',
  });
  delete process.env.AI_URL_PRIVATI;

  const { createStrapi } = require(path.join(radice, 'node_modules/@strapi/strapi'));
  const app = await createStrapi({ appDir, distDir: appDir }).start();

  try {
    assert.strictEqual(app.db.config.connection.client, 'sqlite', 'ABORT: il database non è sqlite');
    await prova(app, porta);
    console.log('OK: sicurezza multi-utente (permessi, utenti, cascata, isolamento, SSRF)');
  } finally {
    await app.destroy();
    fs.rmSync(appDir, { recursive: true, force: true });
    for (const f of fs.readdirSync(path.join(radice, '.tmp'))) {
      if (f.startsWith(`e2e-sicurezza-${process.pid}.db`)) fs.rmSync(path.join(radice, '.tmp', f), { force: true });
    }
  }
}

async function prova(app, porta) {
  const base = `http://127.0.0.1:${porta}`;
  const D = (uid) => app.documents(uid);
  const q = (uid) => app.db.query(uid);
  const conta = (uid, where = {}) => q(uid).count({ where });

  const W = 'api::wallet.wallet', C = 'api::categorie.categorie', T = 'api::transazioni.transazioni';
  const S = 'api::salvadanaio.salvadanaio', K = 'api::consiglio.consiglio';
  const PERM = 'plugin::users-permissions.permission';

  async function http(metodo, percorso, jwt, corpo) {
    const res = await fetch(base + percorso, {
      method: metodo,
      headers: { ...(jwt && { Authorization: `Bearer ${jwt}` }), ...(corpo && !(corpo instanceof FormData) && { 'Content-Type': 'application/json' }) },
      body: corpo instanceof FormData ? corpo : corpo && JSON.stringify(corpo),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  // ── 1. Permessi seedati dal bootstrap ──────────────────────────────────────
  const { PERMESSI } = require(path.join(radice, 'src/permessi'));
  const esistenti = new Set();
  for (const [chiave, v] of Object.entries(app.plugin('users-permissions').service('users-permissions').getActions())) {
    for (const [ctrl, acts] of Object.entries(v.controllers || {})) for (const a of Object.keys(acts)) esistenti.add(`${chiave}.${ctrl}.${a}`);
  }
  for (const p of PERMESSI) assert.ok(esistenti.has(p), `permessi.js: l'azione "${p}" non esiste (refuso?)`);

  const ruolo = await q('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  const concessi = new Set((await q(PERM).findMany({ where: { role: ruolo.id } })).map((p) => p.action));
  for (const p of PERMESSI) assert.ok(concessi.has(p), `il bootstrap non ha abilitato "${p}"`);

  // ── Dati: due utenti ───────────────────────────────────────────────────────
  const utenti = app.plugin('users-permissions').service('user');
  const jwt = (u) => app.plugin('users-permissions').service('jwt').issue({ id: u.id });
  const nuovoUtente = (nome) => utenti.add({ username: nome, email: `${nome}@example.com`, password: 'Prova1234!', provider: 'local', confirmed: true, blocked: false, role: ruolo.id });
  const ada = await nuovoUtente('ada'), bob = await nuovoUtente('bob');
  const jAda = jwt(ada), jBob = jwt(bob);

  // ── 2. /api/users/* ───────────────────────────────────────────────────────
  // Questi permessi NON sono seedati: li abilita qui come farebbe un admin,
  // per verificare che il controller sia sicuro anche allora.
  for (const action of ['findOne', 'count', 'create', 'destroy']) {
    await q(PERM).create({ data: { action: `plugin::users-permissions.user.${action}`, role: ruolo.id } });
  }
  let r = await http('GET', '/api/users', jAda);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((u) => u.username), ['ada'], 'GET /api/users deve ritornare solo l\'utente stesso');
  assert.strictEqual((await http('GET', `/api/users/${ada.id}`, jAda)).body.username, 'ada');
  assert.strictEqual((await http('GET', `/api/users/${bob.id}`, jAda)).status, 404, 'un id altrui non deve risultare');
  assert.strictEqual((await http('GET', '/api/users/count', jAda)).body, 1, 'count non deve rivelare quanti utenti ci sono');
  assert.strictEqual((await http('DELETE', `/api/users/${bob.id}`, jAda)).status, 403, 'destroy non consentito');
  assert.strictEqual((await http('POST', '/api/users', jAda, { username: 'x', email: 'x@y.it', password: 'Prova1234!' })).status, 403, 'create non consentito');
  assert.strictEqual((await http('PUT', `/api/users/${bob.id}`, jAda, { email: 'hack@y.it' })).status, 403, 'update solo del proprio profilo');
  assert.ok(await utenti.fetch(bob.id), 'bob è ancora lì');
  // Senza token niente.
  assert.ok([401, 403].includes((await http('GET', '/api/users')).status));

  // ── Dati di ada: due portafogli, ognuno con categorie, transazioni, ecc. ───
  async function portafoglio(utente, nome) {
    const w = await D(W).create({ data: { Nome: nome, Budget: 1000, users_permissions_user: utente.documentId } });
    const cat = [];
    for (const n of ['A', 'B']) {
      const c = await D(C).create({ data: { Nome: `${nome}-${n}`, Budget_categoria: 100, wallet: w.documentId } });
      for (let i = 1; i <= 3; i++) await D(T).create({ data: { Descrizione: `${nome}-${n}-${i}`, Importo: 10, Data: '2026-11-0' + i, categorie: c.documentId } });
      await D(K).create({ data: { tipo: 'alza', budgetAttuale: 100, budgetProposto: 150, testo: 'x', stato: 'nuovo', categorie: c.documentId } });
      cat.push(c);
    }
    for (const mese of ['2026-09-01', '2026-10-01']) await D(S).create({ data: { mese, budgetAllocato: 500, speso: 100, risparmiato: 0, wallet: w.documentId } });
    return { w, cat };
  }
  const w1 = await portafoglio(ada, 'W1'), w2 = await portafoglio(ada, 'W2'), wBob = await portafoglio(bob, 'WB');
  const totali = async () => ({ w: await conta(W), c: await conta(C), t: await conta(T), s: await conta(S), k: await conta(K) });
  assert.deepStrictEqual(await totali(), { w: 3, c: 6, t: 18, s: 6, k: 6 });

  // Regressione di partenza: senza `user.find` seedato, /api/wallets rispondeva
  // "Invalid key users_permissions_user". Ognuno vede i propri, e solo quelli.
  r = await http('GET', '/api/wallets', jAda);
  assert.strictEqual(r.status, 200, `GET /api/wallets: ${JSON.stringify(r.body?.error)}`);
  assert.deepStrictEqual(r.body.data.map((w) => w.Nome).sort(), ['W1', 'W2']);
  r = await http('GET', '/api/wallets', jBob);
  assert.deepStrictEqual(r.body.data.map((w) => w.Nome), ['WB']);

  const orfani = async () => ({
    categorieSenzaWallet: await conta(C, { wallet: null }),
    transazioniSenzaCategoria: await conta(T, { categorie: null }),
    salvadanaioSenzaWallet: await conta(S, { wallet: null }),
    consigliSenzaCategoria: await conta(K, { categorie: null }),
  });
  const nessunOrfano = { categorieSenzaWallet: 0, transazioniSenzaCategoria: 0, salvadanaioSenzaWallet: 0, consigliSenzaCategoria: 0 };

  // ── 4. Isolamento: bob non può cancellare i dati di ada ────────────────────
  assert.strictEqual((await http('DELETE', `/api/wallets/${w1.w.documentId}`, jBob)).status, 404);
  assert.strictEqual((await http('DELETE', `/api/categories/${w1.cat[0].documentId}`, jBob)).status, 404);
  assert.deepStrictEqual(await totali(), { w: 3, c: 6, t: 18, s: 6, k: 6 }, 'bob non deve aver cancellato nulla');

  // ── 3a. Elimina UNA categoria (REST): via le sue transazioni e consigli ────
  r = await http('DELETE', `/api/categories/${w1.cat[0].documentId}`, jAda);
  assert.ok([200, 204].includes(r.status), `delete categoria: ${r.status}`);
  assert.deepStrictEqual(await totali(), { w: 3, c: 5, t: 15, s: 6, k: 5 }, 'categoria: spariscono 3 transazioni e 1 consiglio');
  assert.deepStrictEqual(await orfani(), nessunOrfano);

  // ── 3b. Guasto a metà cascata: tutto o niente ─────────────────────────────
  const prima = await totali();
  const originale = app.db.query.bind(app.db);
  app.db.query = (uid) => {
    const x = originale(uid);
    return uid === S ? { ...x, findMany: x.findMany.bind(x), deleteMany: async () => { throw new Error('guasto simulato'); } } : x;
  };
  await assert.rejects(D(W).delete({ documentId: w1.w.documentId }), /guasto simulato/);
  app.db.query = originale;
  assert.deepStrictEqual(await totali(), prima, 'dopo un guasto la cascata non deve aver cancellato niente (rollback)');

  // ── 3c. Elimina un portafoglio (REST): via tutto quello che contiene ──────
  r = await http('DELETE', `/api/wallets/${w1.w.documentId}`, jAda);
  assert.ok([200, 204].includes(r.status), `delete wallet: ${r.status}`);
  // W1 aveva 1 categoria rimasta (3 transazioni, 1 consiglio) e 2 salvadanaio.
  assert.deepStrictEqual(await totali(), { w: 2, c: 4, t: 12, s: 4, k: 4 });
  assert.deepStrictEqual(await orfani(), nessunOrfano);

  // ── 3d. Dal Documents API (è la strada del pannello admin) ─────────────────
  await D(W).delete({ documentId: wBob.w.documentId });
  assert.deepStrictEqual(await totali(), { w: 1, c: 2, t: 6, s: 2, k: 2 });
  assert.deepStrictEqual(await orfani(), nessunOrfano);

  // W2 (di ada) è intatto, e nelle tabelle di collegamento non restano righe pendenti.
  assert.strictEqual(await conta(C, { wallet: { documentId: w2.w.documentId } }), 2);
  assert.strictEqual(await conta(T, { categorie: { wallet: { documentId: w2.w.documentId } } }), 6);
  const link = (uid, campo) => app.db.metadata.get(uid).attributes[campo].joinTable.name;
  for (const [uid, campo, atteso] of [[T, 'categorie', 6], [C, 'wallet', 2], [S, 'wallet', 2], [K, 'categorie', 2]]) {
    const tab = link(uid, campo);
    assert.strictEqual(Number((await app.db.connection(tab).count({ n: '*' }))[0].n), atteso, `${tab}: righe di collegamento pendenti`);
  }

  // Cancellare qualcosa che non esiste non deve rompere nulla.
  assert.strictEqual((await http('DELETE', `/api/wallets/${w1.w.documentId}`, jAda)).status, 404);

  // ── 5. SSRF: con AI_URL_PRIVATI=blocca l'indirizzo privato è rifiutato ─────
  const provaAi = (url) => http('POST', '/api/analisi-test-ai', jAda, { motore: 'ollama', url, modello: 'x' });
  r = await provaAi('http://127.0.0.1:9');
  assert.ok(!/non consentito/.test(r.body.messaggio || ''), 'di default (consenti) l\'indirizzo privato non è bloccato');

  process.env.AI_URL_PRIVATI = 'blocca';
  for (const url of ['http://127.0.0.1:9', 'http://localhost:9', 'http://169.254.169.254/latest', 'http://[::1]:9']) {
    r = await provaAi(url);
    assert.strictEqual(r.body.ok, false);
    assert.match(r.body.messaggio, /non consentito/, `${url} deve essere bloccato`);
  }
  // L'analisi lo dice subito con un 400 chiaro, non come "il modello non ha risposto".
  await D(W).update({ documentId: w2.w.documentId, data: {} });
  await utenti.edit(ada.id, { aiMotore: 'ollama', aiUrl: 'http://10.0.0.5:11434' });
  const form = new FormData();
  form.append('walletId', w2.w.documentId);
  form.append('mese', '2026-11');
  form.append('pdf', new Blob(['data,descrizione,importo\n2026-11-02,PROVA,-10\n'], { type: 'text/csv' }), 'e.csv');
  r = await http('POST', '/api/analisi-estratto-conto', jAda, form);
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error.message, /non consentito/);
  delete process.env.AI_URL_PRIVATI;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
