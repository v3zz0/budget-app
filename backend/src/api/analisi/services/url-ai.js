'use strict';

// Controllo dell'indirizzo del motore AI scelto dall'utente (SSRF).
//
// `aiUrl` lo scrive l'utente e il SERVER lo chiama. Con un solo utente (che è
// anche l'amministratore) è una comodità: Ollama sta sul mini PC di casa, cioè
// su un indirizzo privato. Con più utenti è un buco: chiunque potrebbe far fare
// al server richieste verso la rete interna (altri container, localhost, il
// servizio di metadata del cloud) e leggerne la risposta.
//
// AI_URL_PRIVATI=consenti (default)  qualunque indirizzo: comportamento di sempre
// AI_URL_PRIVATI=blocca              rifiuta gli indirizzi che risolvono a una rete
//                                    privata, loopback, link-local o riservata.
//                                    Da impostare su un'istanza con più utenti.
//
// Si controlla solo l'URL scelto dall'utente. Quello predefinito, configurato
// dall'amministratore (OLLAMA_URL), è fidato.
//
// ponytail: il nome si risolve qui e poi di nuovo dentro fetch. Un DNS ostile
// può rispondere in modo diverso la seconda volta (DNS rebinding). Per chiuderlo
// del tutto bisogna collegarsi direttamente all'IP verificato, passando da un
// Agent con `lookup` personalizzato.

const dns = require('node:dns').promises;
const net = require('node:net');

const bloccaPrivati = () => process.env.AI_URL_PRIVATI === 'blocca';

function ipv4Privato(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || // "questa rete"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, compreso il metadata dei cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast e riservati
  );
}

function ipv6Privato(ip) {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  // IPv4 mappato in IPv6: ::ffff:127.0.0.1 oppure ::ffff:7f00:1
  const puntato = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (puntato) return ipv4Privato(puntato[1]);
  const esa = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (esa) {
    const n = (parseInt(esa[1], 16) << 16) | parseInt(esa[2], 16);
    return ipv4Privato([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }
  return /^f[cd]/.test(s) || /^fe[89ab]/.test(s); // fc00::/7 e fe80::/10
}

const ipPrivato = (ip) => (net.isIPv4(ip) ? ipv4Privato(ip) : ipv6Privato(ip));

/** Lancia se l'indirizzo non è utilizzabile. Con `blocca`, anche se è privato. */
async function verificaUrlAi(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Indirizzo AI non valido');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Indirizzo AI non valido: solo http o https');
  if (!bloccaPrivati()) return;

  // new URL() porta già gli indirizzi alla forma canonica (anche 2130706433 → 127.0.0.1).
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let indirizzi;
  try {
    indirizzi = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    throw new Error('Indirizzo AI non raggiungibile: il nome non si risolve');
  }
  if (indirizzi.some(ipPrivato)) {
    throw new Error('Indirizzo AI non consentito: punta a una rete privata');
  }
}

module.exports = { verificaUrlAi, bloccaPrivati, ipPrivato };
