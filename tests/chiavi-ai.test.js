'use strict';

// Check della cifratura delle chiavi AI: node tests/chiavi-ai.test.js
// (fuori da src/: Strapi carica come service tutto ciò che sta in src/api/*/services/)

const assert = require('node:assert');
const { cifra, decifra, cifraDati, PREFISSO } = require('../src/chiavi-ai');

delete process.env.ENCRYPTION_KEY;
process.env.AI_KEYS_SECRET = 'un-segreto-lungo-e-casuale-di-prova';

// Andata e ritorno; il cifrato non contiene la chiave e cambia a ogni volta (IV casuale).
const chiave = 'sk-or-v1-abcdef0123456789';
const a = cifra(chiave), b = cifra(chiave);
assert.ok(a.startsWith(PREFISSO));
assert.ok(!a.includes(chiave) && !a.includes('abcdef'), 'la chiave non deve comparire nel cifrato');
assert.notStrictEqual(a, b, 'due cifrature dello stesso testo devono differire (IV casuale)');
assert.strictEqual(decifra(a), chiave);
assert.strictEqual(decifra(b), chiave);
assert.strictEqual(decifra('€ chiave con accenti àèì'), '€ chiave con accenti àèì', 'un valore in chiaro (vecchio) torna com\'è');
assert.strictEqual(decifra(cifra('€ àèì ✓')), '€ àèì ✓', 'unicode');

// Idempotente: salvare due volte non cifra due volte (il form dell'admin rimanda il valore com'è).
assert.strictEqual(cifra(a), a);

// Vuoto e null restano com'erano: "cancella la chiave" deve funzionare.
assert.strictEqual(cifra(''), '');
assert.strictEqual(cifra(null), null);
assert.strictEqual(decifra(null), null);
assert.strictEqual(decifra(''), '');

// Alterazione: il tag GCM lo scopre, e si ritorna vuoto invece di un blob.
const [iv, tag, ct] = a.slice(PREFISSO.length).split(':');
const alterato = `${PREFISSO}${iv}:${tag}:${Buffer.from(ct, 'base64url').map((x) => x ^ 1).toString('base64url')}`;
assert.strictEqual(decifra(alterato), '');
assert.strictEqual(decifra(`${PREFISSO}spazzatura`), '');

// Segreto cambiato: la chiave non si legge (e non si legge una sbagliata).
process.env.AI_KEYS_SECRET = 'un-altro-segreto';
assert.strictEqual(decifra(a), '');
process.env.AI_KEYS_SECRET = 'un-segreto-lungo-e-casuale-di-prova';
assert.strictEqual(decifra(a), chiave);

// cifraDati: solo i due campi chiave, solo se stringhe; il resto non si tocca.
const dati = { aiChiave: 'k1', aiChiaveLlamacpp: 'k2', aiUrl: 'http://x', aiMotore: 'ollama', aiChiaveImpostata: true };
cifraDati(dati);
assert.ok(dati.aiChiave.startsWith(PREFISSO) && dati.aiChiaveLlamacpp.startsWith(PREFISSO));
assert.strictEqual(dati.aiUrl, 'http://x');
assert.strictEqual(dati.aiChiaveImpostata, true);
cifraDati({ aiUrl: 'x' }); cifraDati(undefined); // non deve lanciare

// Senza nessun segreto non si cifra (e lo si dice all'avvio): meglio che perdere le chiavi.
delete process.env.AI_KEYS_SECRET;
assert.strictEqual(cifra('sk-x'), 'sk-x');
// ENCRYPTION_KEY di Strapi basta come segreto, e produce una chiave diversa da AI_KEYS_SECRET.
process.env.ENCRYPTION_KEY = 'chiave-di-strapi';
const c = cifra('sk-x');
assert.ok(c.startsWith(PREFISSO));
assert.strictEqual(decifra(c), 'sk-x');
process.env.AI_KEYS_SECRET = 'chiave-di-strapi';
assert.strictEqual(decifra(c), 'sk-x', 'AI_KEYS_SECRET con lo stesso valore dà la stessa chiave');

console.log('OK: chiavi AI cifrate (AES-256-GCM, idempotente, alterazione e segreto sbagliato rilevati)');
