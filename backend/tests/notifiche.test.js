'use strict';

const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createECDH } = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const webPush = require('web-push');
const calendario = require('../src/notifiche/calendario');
const trasporto = require('../src/notifiche/trasporto');

function iscrizione(nome) {
  const key = createECDH('prime256v1');
  key.generateKeys();
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/' + nome,
    expirationTime: null,
    keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

test('le scadenze usano il calendario italiano e il giorno più vicino a fine mese', () => {
  assert.deepEqual(calendario.oraLocale(new Date('2026-03-29T01:30:00Z')), { data: '2026-03-29', orario: '03:30' });
  assert.equal(calendario.aggiungiGiorni('2026-12-31', 1), '2027-01-01');
  assert.equal(calendario.meseDi('2028-02-07').fine, '2028-02-29');
  const t = { Data: '2026-01-31' };
  assert.equal(calendario.scadeIl(t, '2025-12-31'), false);
  assert.equal(calendario.scadeIl(t, '2026-02-27'), false);
  assert.equal(calendario.scadeIl(t, '2026-02-28'), true);
  assert.equal(calendario.scadeIl(t, '2026-03-31'), true);
  assert.equal(calendario.scadeIl({ ...t, RicorrenzaTemporale: '2026-01-15' }, '2026-02-15'), true);
  assert.equal(calendario.valide({ orario: '24:00', scadenze: 1, budget: false }), false);
});

test('il server accetta soltanto sottoscrizioni valide dei servizi push supportati', () => {
  const valore = iscrizione('test');
  assert.deepEqual(trasporto.validaIscrizione(valore), valore);
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/test', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.example.org/push']) {
    assert.equal(trasporto.validaIscrizione({ ...valore, endpoint }), null);
  }
  assert.equal(trasporto.validaIscrizione({ ...valore, expirationTime: 1 }), null);
  assert.equal(trasporto.validaIscrizione({ ...valore, keys: { ...valore.keys, p256dh: 'x' } }), null);
});

const portaMySQL = process.env.BUDGET_NOTIFICHE_TEST_MYSQL_PORT;

test('API, pianificazione, isolamento e persistenza su MySQL di prova', { skip: !portaMySQL, timeout: 120000 }, async (t) => {
  const listener = net.createServer();
  await new Promise((ok) => listener.listen(0, '127.0.0.1', ok));
  const porta = listener.address().port;
  await new Promise((ok) => listener.close(ok));
  const base = 'http://127.0.0.1:' + porta + '/api';
  const keys = webPush.generateVAPIDKeys();
  Object.assign(process.env, {
    ENV_PATH: '/dev/null', DATABASE_CLIENT: 'mysql', DATABASE_HOST: '127.0.0.1', DATABASE_PORT: portaMySQL,
    DATABASE_NAME: 'budget_push_test', DATABASE_USERNAME: 'budget_test', DATABASE_PASSWORD: 'temporary_budget_test',
    DATABASE_SSL: 'false', HOST: '127.0.0.1', PORT: String(porta), NODE_ENV: 'test',
    STRAPI_TELEMETRY_DISABLED: 'true', JWT_SECRET: 'budget-test-jwt', APP_KEYS: 'a,b,c,d',
    API_TOKEN_SALT: 'test', ADMIN_JWT_SECRET: 'test', TRANSFER_TOKEN_SALT: 'test', ENCRYPTION_KEY: 'test',
    BUDGET_WEB_PUSH_PUBLIC_KEY: keys.publicKey, BUDGET_WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    BUDGET_WEB_PUSH_SUBJECT: 'mailto:test@example.invalid',
  });
  const { createStrapi } = require('@strapi/strapi');
  // L'installazione da aggiornare ha già la colonna enum usata dalla migrazione storica.
  const mysql = require('mysql2/promise');
  const db = await mysql.createConnection({
    host: '127.0.0.1', port: Number(portaMySQL), database: 'budget_push_test',
    user: 'budget_test', password: 'temporary_budget_test',
  });
  try {
    await db.query("CREATE TABLE IF NOT EXISTS up_users (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, ai_motore ENUM('ollama', 'openrouter') DEFAULT 'ollama')");
  } finally {
    await db.end();
  }
  const appDir = path.resolve(__dirname, '..');
  async function avviaStrapi() {
    const avviata = await createStrapi({ appDir, distDir: appDir }).start();
    avviata.cron.remove('notificheBudget');
    return avviata;
  }
  let app = await avviaStrapi();
  t.after(async () => { if (app) await app.destroy(); });
  const inviati = [];
  t.mock.method(webPush, 'sendNotification', async (browser, payload, opzioni) => {
    const richiesta = webPush.generateRequestDetails(browser, payload, opzioni);
    assert.equal(richiesta.headers['Content-Encoding'], 'aes128gcm');
    if (browser.endpoint.endsWith('/scaduto')) throw Object.assign(new Error('scaduto'), { statusCode: 410 });
    inviati.push({ endpoint: browser.endpoint, ...JSON.parse(payload) });
  });
  const { elabora } = require('../src/notifiche/pianifica');
  const { DEVICE } = require('../src/notifiche/dispositivi');
  const nuovo = Date.now().toString(36);
  const userService = app.plugin('users-permissions').service('user');
  const ruolo = await app.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  const utente = (nome, preferenze = {}) => userService.add({
    username: nome + nuovo, email: nome + nuovo + '@example.invalid', password: 'PasswordDiProva!',
    provider: 'local', confirmed: true, role: ruolo.id, ...preferenze,
  });
  const a = await utente('prima', { orarioNotifiche: '09:15:00' });
  const b = await utente('seconda');
  const jwt = (u) => app.plugin('users-permissions').service('jwt').issue({ id: u.id });
  const tokenA = jwt(a);
  const tokenB = jwt(b);

  async function api(method, path, token, data) {
    const r = await fetch(base + path, {
      method,
      headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(data && { 'Content-Type': 'application/json' }) },
      body: data && JSON.stringify(data),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  async function dati(u, nome, escludiDaStatistiche = false) {
    const wallet = await app.documents('api::wallet.wallet').create({ data: {
      Nome: nome, users_permissions_user: u.documentId, escludiDaStatistiche,
    } });
    const categoria = await app.documents('api::categorie.categorie').create({ data: {
      Nome: nome, wallet: wallet.documentId, Budget_categoria: 100,
    } });
    const ricorrente = await app.documents('api::transazioni.transazioni').create({ data: {
      Descrizione: 'Descrizione riservata', Importo: 12.34, Data: '2026-01-31', TransazioneRicorrente: true, categorie: categoria.documentId,
    } });
    await app.documents('api::transazioni.transazioni').create({ data: {
      Importo: 105, Data: '2026-02-15', categorie: categoria.documentId,
    } });
    return { ricorrente, categoria, wallet };
  }

  const primo = await dati(a, 'Primo portafoglio');
  const secondo = await dati(b, 'Altro portafoglio');
  const escluso = await dati(a, 'Solo promemoria', true);
  const dispositivo = { ...iscrizione(nuovo + '-1'), idBrowser: randomUUID() };
  const altroDispositivo = { ...iscrizione(nuovo + '-2'), idBrowser: randomUUID() };
  const diB = { ...iscrizione('scaduto'), idBrowser: randomUUID() };
  const registrazione = '/notifiche/dispositivi';
  assert.ok([401, 403].includes((await api('GET', '/notifiche')).status));
  const statoIniziale = await api('GET', '/notifiche', tokenA);
  assert.deepEqual(statoIniziale.body, {
    publicKey: keys.publicKey, attivo: false, preferenze: { orario: '09:15', scadenze: null, budget: false }, fuso: 'Europe/Rome',
  });
  assert.equal((await api('PUT', '/notifiche/preferenze', tokenA, { orario: '25:00', budget: true, scadenze: 1 })).status, 400);

  const prefs = { orario: '09:15', scadenze: 1, budget: true };
  assert.deepEqual((await api('PUT', '/notifiche/preferenze', tokenA, prefs)).body, prefs);
  assert.equal((await api('PUT', '/users/' + a.id, tokenA, { orarioNotifiche: '10:00:00' })).status, 200);
  assert.equal((await api('GET', '/users/me', tokenA)).body.orarioNotifiche.slice(0, 5), '10:00');
  assert.deepEqual((await api('GET', '/notifiche', tokenA)).body.preferenze, prefs);
  assert.equal((await api('GET', '/notifiche', tokenB)).body.preferenze.budget, false);
  assert.equal((await api('PUT', registrazione, tokenA, { ...dispositivo, endpoint: 'https://127.0.0.1/push' })).status, 400);
  const registrato = await api('PUT', registrazione, tokenA, dispositivo);
  assert.equal(registrato.status, 200, JSON.stringify(registrato.body));
  const { impronta } = registrato.body;
  assert.equal((await api('PUT', registrazione, tokenA, dispositivo)).body.impronta, impronta);
  assert.equal((await api('PUT', registrazione, tokenA, altroDispositivo)).status, 200);
  assert.equal((await api('PUT', registrazione, tokenB, dispositivo)).status, 409);
  assert.equal((await api('GET', '/notifiche?impronta=' + impronta, tokenB)).body.attivo, false);
  assert.equal((await api('DELETE', registrazione + '/' + impronta, tokenB)).status, 204);
  assert.equal((await api('GET', '/notifiche?impronta=' + impronta, tokenA)).body.attivo, true);
  assert.equal((await api('GET', '/transazionis/' + primo.ricorrente.documentId, tokenB)).status, 404);
  assert.equal((await api('POST', registrazione + '/' + impronta + '/prova', tokenB)).status, 404);
  assert.equal((await api('POST', registrazione + '/' + impronta + '/prova', tokenA)).status, 204);
  assert.equal((await api('POST', registrazione + '/' + impronta + '/prova', tokenA)).status, 429);
  assert.equal(inviati.pop().tipo, 'prova');

  await elabora(app, new Date('2026-02-27T08:14:00Z'));
  assert.deepEqual(inviati.map((p) => p.tipo), ['budget', 'budget']);
  await Promise.all([
    elabora(app, new Date('2026-02-27T08:15:00Z')),
    elabora(app, new Date('2026-02-27T08:15:00Z')),
  ]);
  assert.deepEqual(inviati.map((p) => p.tipo).sort(), ['budget', 'budget', 'scadenza', 'scadenza', 'scadenza', 'scadenza']);
  for (const p of inviati) {
    assert.ok([primo.ricorrente.documentId, primo.categoria.documentId, escluso.ricorrente.documentId].includes(p.riferimento));
    assert.notEqual(p.riferimento, secondo.ricorrente.documentId);
    assert.ok(!JSON.stringify(p).includes('Descrizione riservata'));
    if (p.tipo === 'scadenza') assert.equal(p.giorno, '2026-02-28');
  }

  await app.destroy();
  app = null;
  app = await avviaStrapi();
  const stato = await api('GET', '/notifiche?impronta=' + impronta, tokenA);
  assert.equal(stato.body.attivo, true);
  assert.deepEqual(stato.body.preferenze, prefs);
  await elabora(app, new Date('2026-02-27T09:15:00Z'));
  assert.equal(inviati.length, 6, 'nessun duplicato al riavvio');
  await api('PUT', '/notifiche/preferenze', tokenA, { ...prefs, scadenze: 0 });
  await elabora(app, new Date('2026-02-28T09:15:00Z'));
  assert.equal(inviati.length, 6, 'cambiare anticipo non duplica una scadenza già inviata');
  assert.equal((await api('DELETE', registrazione + '/' + impronta, tokenA)).status, 204);
  assert.equal((await api('GET', '/notifiche?impronta=' + impronta, tokenA)).body.attivo, false);
  const nuovaIscrizione = { ...iscrizione(nuovo + '-riattivato'), idBrowser: dispositivo.idBrowser };
  assert.equal((await api('PUT', registrazione, tokenA, nuovaIscrizione)).status, 200);
  await elabora(app, new Date('2026-02-28T09:16:00Z'));
  assert.equal(inviati.length, 6, 'riattivare lo stesso browser non duplica gli avvisi del mese');
  const scaduto = await api('PUT', registrazione, tokenB, diB);
  assert.equal((await api('POST', registrazione + '/' + scaduto.body.impronta + '/prova', tokenB)).status, 404);
  assert.equal(await app.db.query(DEVICE).count({ where: { impronta: scaduto.body.impronta } }), 0);
  await app.db.query('plugin::users-permissions.user').delete({ where: { id: a.id } });
  assert.equal(await app.db.query(DEVICE).count({ where: { impronta: trasporto.sha(altroDispositivo.endpoint) } }), 0);
});
