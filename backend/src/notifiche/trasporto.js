'use strict';

const { ECDH, createECDH, createHash } = require('node:crypto');
const webPush = require('web-push');

const sha = (value) => createHash('sha256').update(value).digest('hex');
const hosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);

function base64url(value, size) {
  return typeof value === 'string' && value.length === Math.ceil(size * 4 / 3) &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}

function configurazione() {
  const publicKey = process.env.BUDGET_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.BUDGET_WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.BUDGET_WEB_PUSH_SUBJECT;
  if (!base64url(publicKey, 65) || !base64url(privateKey, 32) ||
      !/^mailto:[^\s@]+@[^\s@]+$/.test(subject || '')) return null;

  try {
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (key.getPublicKey().toString('base64url') === publicKey) return { publicKey, privateKey, subject };
  } catch {
    // La configurazione invalida lascia disponibili le altre funzioni dell’app.
  }
  return null;
}

function validaIscrizione(value, now = Date.now()) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return null;
  const { keys, expirationTime } = value;
  try {
    const url = new URL(value.endpoint);
    // L'endpoint viene contattato dal server. Sono ammessi solo servizi push noti.
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.hash || url.pathname === '/' || url.href !== value.endpoint ||
        (!hosts.has(url.hostname) && !/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)) ||
        !base64url(keys?.p256dh, 65) || !base64url(keys?.auth, 16) ||
        Buffer.from(keys.p256dh, 'base64url')[0] !== 4 ||
        (expirationTime != null && (!Number.isSafeInteger(expirationTime) || expirationTime <= now))) return null;

    ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1');
    return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth }, expirationTime: expirationTime ?? null };
  } catch {
    return null;
  }
}

function invia(dispositivo, evento, vapid) {
  const { endpoint, keys } = dispositivo.iscrizione;
  const messaggio = JSON.stringify({ ...evento, dispositivo: dispositivo.impronta });
  return webPush.sendNotification({ endpoint, keys }, messaggio, {
    vapidDetails: vapid,
    TTL: 300,
    timeout: 3500,
    topic: evento.tag,
  });
}

function rispostaDefinitiva(err) {
  return [404, 410].includes(err.statusCode);
}

module.exports = { configurazione, validaIscrizione, sha, invia, rispostaDefinitiva };
