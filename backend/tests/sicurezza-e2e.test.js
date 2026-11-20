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
//   6. registrazione, recupero password e conferma email sono chiusi
//   7. le chiavi AI stanno cifrate nel database (anche le vecchie, in chiaro)
//   8. eliminare un utente elimina i suoi dati (da Documents API, service e db)
//   9. la pulizia degli orfani (anteprima, eliminazione, wallet senza utente)
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
    AI_KEYS_SECRET: 'segreto-di-prova-per-le-chiavi-ai', APP_KEYS: 'a,b,c,d', API_TOKEN_SALT: 'x', ADMIN_JWT_SECRET: 'x', TRANSFER_TOKEN_SALT: 'x', JWT_SECRET: 'x', ENCRYPTION_KEY: 'x',
  });
  delete process.env.AI_URL_PRIVATI;

  const { createStrapi } = require(path.join(radice, 'node_modules/@strapi/strapi'));
  const app = await createStrapi({ appDir, distDir: appDir }).start();

  try {
    assert.strictEqual(app.db.config.connection.client, 'sqlite', 'ABORT: il database non è sqlite');
    await prova(app, porta);
    console.log('OK: sicurezza multi-utente (permessi, utenti, cascata, utenti eliminati, pulizia orfani, accesso chiuso, chiavi cifrate, SSRF)');
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

  // ── 8. Eliminare un utente elimina i suoi dati ─────────────────────────────
  const base0 = await totali();
  const USER = 'plugin::users-permissions.user';
  const esisteUtente = async (u) => !!(await q(USER).findOne({ where: { id: u.id } }));

  // (a) Documents API: è la strada del pannello admin (Content Manager).
  const carla = await nuovoUtente('carla');
  await portafoglio(carla, 'WC');
  assert.strictEqual((await totali()).w, base0.w + 1);
  await D(USER).delete({ documentId: carla.documentId });
  assert.strictEqual(await esisteUtente(carla), false, 'carla deve essere stata eliminata');
  assert.deepStrictEqual(await totali(), base0, 'i dati di carla devono sparire con lei');
  assert.deepStrictEqual(await orfani(), nessunOrfano);

  // (b) il service che usa l'API di users-permissions
  const dave = await nuovoUtente('dave');
  await portafoglio(dave, 'WD');
  await utenti.remove({ id: dave.id });
  assert.strictEqual(await esisteUtente(dave), false);
  assert.deepStrictEqual(await totali(), base0);

  // (c) deleteMany diretto su più utenti insieme
  const erin = await nuovoUtente('erin'), frank = await nuovoUtente('frank');
  await portafoglio(erin, 'WE');
  await portafoglio(frank, 'WF');
  await q(USER).deleteMany({ where: { id: { $in: [erin.id, frank.id] } } });
  assert.deepStrictEqual(await totali(), base0);
  assert.deepStrictEqual(await orfani(), nessunOrfano);
  // Gli altri utenti e i loro dati non si toccano.
  assert.ok(await esisteUtente(ada) && await esisteUtente(bob));
  assert.strictEqual(await conta(W, { users_permissions_user: { id: ada.id } }), 1);

  // ── 9. Pulizia degli orfani ────────────────────────────────────────────────
  // Gli orfani si creano come li lasciava il vecchio comportamento: cancellando
  // le righe dal db SENZA passare dal Documents API, quindi senza cascata.
  const { trovaOrfani, eliminaOrfani } = require(path.join(radice, 'src/cascata'));
  const base9 = await totali();

  const wo = await portafoglio(ada, 'WO'); // 2 categorie × 3 transazioni, 2 consigli, 2 salvadanaio
  await q(W).delete({ where: { id: wo.w.id } }); // → categorie, transazioni, salvadanaio, consigli orfani
  const wp = await portafoglio(ada, 'WP'); // portafoglio LEGITTIMO, non va toccato
  await q(C).delete({ where: { id: wp.cat[0].id } }); // → 3 transazioni e 1 consiglio senza categoria
  const wn = await D(W).create({ data: { Nome: 'WN', Budget: 10 } }); // senza utente
  const cn = await D(C).create({ data: { Nome: 'WN-A', Budget_categoria: 5, wallet: wn.documentId } });
  for (const i of [1, 2]) await D(T).create({ data: { Descrizione: `WN-${i}`, Importo: 5, Data: '2026-11-1' + i, categorie: cn.documentId } });

  const primaPulizia = await totali();
  let o = await trovaOrfani(app);
  assert.strictEqual(o.categorie.length, 2, 'categorie orfane');
  assert.strictEqual(o.transazioni, 9, 'transazioni orfane: 6 di categorie orfane + 3 senza categoria');
  assert.strictEqual(o.salvadanaio, 2);
  assert.strictEqual(o.consigli, 3, 'consigli orfani: 2 di categorie orfane + 1 senza categoria');
  assert.strictEqual(o.totale, 16);
  assert.deepStrictEqual(o.walletSenzaUtente.map((w) => [w.Nome, w.categorie, w.transazioni]), [['WN', 1, 2]]);
  assert.deepStrictEqual(await totali(), primaPulizia, "l'anteprima non deve cancellare niente");

  // Senza il flag: via gli orfani, restano il wallet senza utente e il portafoglio legittimo.
  let eliminati = await eliminaOrfani(app);
  assert.deepStrictEqual(eliminati, { wallet: 0, categorie: 2, transazioni: 9, salvadanaio: 2, consigli: 3 });
  o = await trovaOrfani(app);
  assert.strictEqual(o.totale, 0);
  assert.strictEqual(o.walletSenzaUtente.length, 1, 'il wallet senza utente non si tocca senza --wallet-senza-utente');
  assert.strictEqual(await conta(T, { categorie: { documentId: cn.documentId } }), 2);
  assert.strictEqual(await conta(C, { wallet: { documentId: wp.w.documentId } }), 1, 'WP: resta la categoria B');
  assert.strictEqual(await conta(T, { categorie: { wallet: { documentId: wp.w.documentId } } }), 3, 'WP: restano le transazioni di B');
  assert.strictEqual(await conta(S, { wallet: { documentId: wp.w.documentId } }), 2, 'WP: resta il salvadanaio');
  assert.deepStrictEqual(await eliminaOrfani(app), { wallet: 0, categorie: 0, transazioni: 0, salvadanaio: 0, consigli: 0 }, 'seconda esecuzione: nulla da fare');

  // Col flag: via anche il wallet senza utente, con tutto il suo contenuto.
  eliminati = await eliminaOrfani(app, { walletSenzaUtente: true });
  assert.deepStrictEqual(eliminati, { wallet: 1, categorie: 1, transazioni: 2, salvadanaio: 0, consigli: 0 });
  o = await trovaOrfani(app);
  assert.strictEqual(o.totale, 0);
  assert.strictEqual(o.walletSenzaUtente.length, 0);

  // Pulizia del portafoglio legittimo: si torna esattamente alla base.
  await D(W).delete({ documentId: wp.w.documentId });
  assert.deepStrictEqual(await totali(), base9, 'dopo la pulizia i dati tornano a quelli di partenza');
  assert.deepStrictEqual(await orfani(), nessunOrfano);

  // ── 6. Accesso chiuso: gli account li crea solo l'amministratore ───────────
  r = await http('POST', '/api/auth/local/register', null, { username: 'intruso', email: 'intruso@example.com', password: 'Prova1234!' });
  assert.strictEqual(r.status, 403, 'la registrazione deve essere chiusa');
  assert.strictEqual(await q(USER).findOne({ where: { username: 'intruso' } }), null, 'nessun utente deve essere stato creato');
  assert.strictEqual((await http('POST', '/api/auth/forgot-password', null, { email: 'ada@example.com' })).status, 403);
  assert.strictEqual((await http('POST', '/api/auth/reset-password', null, { code: 'x', password: 'Prova1234!', passwordConfirmation: 'Prova1234!' })).status, 403);
  assert.strictEqual((await http('GET', '/api/auth/email-confirmation?confirmation=x')).status, 403);
  assert.strictEqual((await http('POST', '/api/auth/send-email-confirmation', null, { email: 'ada@example.com' })).status, 403);
  // Chi ha un account (creato dall'admin) entra, e cambia la propria password dal Profilo.
  r = await http('POST', '/api/auth/local', null, { identifier: 'ada@example.com', password: 'Prova1234!' });
  assert.strictEqual(r.status, 200, 'il login deve funzionare');
  assert.strictEqual((await http('POST', '/api/auth/change-password', jAda, { currentPassword: 'sbagliata', password: 'Nuova12345!', passwordConfirmation: 'Nuova12345!' })).status, 400);
  assert.strictEqual((await http('POST', '/api/auth/change-password', jAda, { currentPassword: 'Prova1234!', password: 'Nuova12345!', passwordConfirmation: 'Nuova12345!' })).status, 200);
  assert.strictEqual((await http('POST', '/api/auth/local', null, { identifier: 'ada@example.com', password: 'Nuova12345!' })).status, 200);

  // ── 7. Chiavi AI cifrate nel database ──────────────────────────────────────
  const { cifraEsistenti, PREFISSO } = require(path.join(radice, 'src/chiavi-ai'));
  const llm = require(path.join(radice, 'src/api/analisi/services/llm-client'));
  const colonna = app.db.metadata.get(USER).attributes.aiChiave.columnName;
  const grezzo = async (u) => (await app.db.connection('up_users').where({ id: u.id }).first())[colonna];

  r = await http('PUT', `/api/users/${ada.id}`, jAda, { aiMotore: 'openrouter', aiChiave: 'sk-test-12345', aiChiaveImpostata: true });
  assert.strictEqual(r.status, 200, `PUT chiave: ${JSON.stringify(r.body?.error)}`);
  const salvata = await grezzo(ada);
  assert.ok(salvata.startsWith(PREFISSO), 'la chiave nel database deve essere cifrata');
  assert.ok(!salvata.includes('sk-test'), 'la chiave in chiaro non deve comparire nel database');
  assert.strictEqual(llm.chiaveDiUtente(await utenti.fetch(ada.id), 'openrouter'), 'sk-test-12345', 'chiaveDiUtente la decifra');
  // L'API non la restituisce, e dice solo che c'è.
  r = await http('GET', '/api/users/me', jAda);
  assert.strictEqual(r.body.aiChiave, undefined);
  assert.strictEqual(r.body.aiChiaveImpostata, true);
  // Salvare altro (senza toccare la chiave) non la altera né la ricifra.
  await http('PUT', `/api/users/${ada.id}`, jAda, { aiModello: 'altro-modello' });
  assert.strictEqual(await grezzo(ada), salvata);
  // Il form dell'admin rimanda il valore cifrato com'è: non si cifra due volte.
  await utenti.edit(ada.id, { aiChiave: salvata });
  assert.strictEqual(await grezzo(ada), salvata);
  assert.strictEqual(llm.chiaveDiUtente(await utenti.fetch(ada.id), 'openrouter'), 'sk-test-12345');

  // Vecchia installazione: una chiave in chiaro, scritta senza passare dal lifecycle.
  await app.db.connection('up_users').where({ id: bob.id }).update({ [colonna]: 'sk-vecchia-in-chiaro' });
  assert.strictEqual(await grezzo(bob), 'sk-vecchia-in-chiaro');
  assert.strictEqual(llm.chiaveDiUtente(await utenti.fetch(bob.id), 'openrouter'), 'sk-vecchia-in-chiaro', 'finché non migrata si legge lo stesso');
  await cifraEsistenti(app);
  assert.ok((await grezzo(bob)).startsWith(PREFISSO), 'il bootstrap deve cifrare le chiavi vecchie');
  assert.strictEqual(llm.chiaveDiUtente(await utenti.fetch(bob.id), 'openrouter'), 'sk-vecchia-in-chiaro');

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
