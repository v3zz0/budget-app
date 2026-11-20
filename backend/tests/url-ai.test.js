'use strict';

// Check del controllo sull'indirizzo AI (SSRF): node tests/url-ai.test.js
// Fuori da src/ apposta: Strapi carica come service tutto ciò che sta in src/api/*/services/.

const assert = require('node:assert');
const { verificaUrlAi, ipPrivato } = require('../src/api/analisi/services/url-ai');

(async () => {
  // Classificazione degli indirizzi
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'fd12:3456::1', 'fc00::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1']) {
    assert.strictEqual(ipPrivato(ip), true, `${ip} deve essere privato`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.0.1', '169.253.0.1',
    '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.strictEqual(ipPrivato(ip), false, `${ip} deve essere pubblico`);
  }

  // Default: si accetta tutto, come prima (Ollama sulla rete di casa).
  delete process.env.AI_URL_PRIVATI;
  await verificaUrlAi('http://192.168.1.10:11434');
  await verificaUrlAi('http://localhost:11434');

  // Un indirizzo malformato o con schema strano si rifiuta sempre.
  await assert.rejects(verificaUrlAi('non un url'), /non valido/);
  await assert.rejects(verificaUrlAi('file:///etc/passwd'), /solo http o https/);
  await assert.rejects(verificaUrlAi('gopher://x'), /solo http o https/);

  // Con `blocca`: niente reti private, in nessuna forma.
  process.env.AI_URL_PRIVATI = 'blocca';
  for (const u of ['http://127.0.0.1:11434', 'http://localhost:8080', 'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5', 'http://192.168.1.10:11434', 'http://[::1]:80', 'http://[::ffff:127.0.0.1]/',
    'http://2130706433/', 'http://0x7f.0.0.1/']) {
    await assert.rejects(verificaUrlAi(u), /non consentito/, `${u} deve essere bloccato`);
  }
  // Pubblico (letterale, senza DNS): passa.
  await verificaUrlAi('https://1.1.1.1/v1');
  await verificaUrlAi('https://[2606:4700:4700::1111]/v1');
  // Un nome che non si risolve non passa come "valido": meglio un errore chiaro.
  await assert.rejects(verificaUrlAi('http://questo-nome-non-esiste.invalid'), /non si risolve/);

  delete process.env.AI_URL_PRIVATI;
  console.log('OK: controllo indirizzo AI (privati bloccati solo con AI_URL_PRIVATI=blocca)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
