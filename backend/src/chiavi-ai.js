'use strict';

// Chiavi AI cifrate nel database.
//
// `aiChiave` (OpenRouter) e `aiChiaveLlamacpp` sono credenziali di servizi a
// pagamento. Erano in chiaro nella tabella degli utenti: un dump del DB, un
// backup o chi guarda la tabella dall'admin le avrebbe lette. Ora si salvano
// cifrate (AES-256-GCM) e si decifrano solo al momento di chiamare il modello.
//
// Formato: `enc:v1:<iv>:<tag>:<testo cifrato>` (base64url). Il prefisso serve a
// riconoscere un valore già cifrato (così salvare due volte non lo cifra due
// volte, e il form dell'admin che rimanda il valore com'è non lo rompe) e a
// leggere i vecchi valori in chiaro finché il bootstrap non li ha migrati.
//
// Segreto: AI_KEYS_SECRET, oppure in mancanza ENCRYPTION_KEY (che ogni
// installazione Strapi ha già). Senza nessuno dei due non si cifra, e lo si dice
// nei log all'avvio.
//
// ponytail: nessuna rotazione del segreto. Cambiarlo rende illeggibili le chiavi
// salvate: l'utente le deve reinserire (si vede come "Connessione non riuscita").
// Per ruotarlo senza perdite: decifrare con il vecchio, ricifrare con il nuovo.

const crypto = require('node:crypto');

const PREFISSO = 'enc:v1:';
const CAMPI = ['aiChiave', 'aiChiaveLlamacpp'];
const USER_UID = 'plugin::users-permissions.user';

const segreto = () => process.env.AI_KEYS_SECRET || process.env.ENCRYPTION_KEY || null;

// Il segreto è una stringa qualunque: la si porta a 32 byte con un'etichetta,
// così la stessa ENCRYPTION_KEY non produce la stessa chiave in altri usi.
const chiave = () => crypto.createHash('sha256').update(`budget-api/ai-keys\0${segreto()}`).digest();

const giaCifrato = (v) => typeof v === 'string' && v.startsWith(PREFISSO);

function cifra(testo) {
  if (!testo || giaCifrato(testo) || !segreto()) return testo;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chiave(), iv);
  const cifrato = Buffer.concat([c.update(String(testo), 'utf8'), c.final()]);
  return PREFISSO + [iv, c.getAuthTag(), cifrato].map((b) => b.toString('base64url')).join(':');
}

/** Il valore in chiaro. Un valore non cifrato (vecchio) torna com'è. Se non si
 *  riesce a decifrare (segreto cambiato, dato alterato) ritorna '' e lo logga:
 *  meglio "nessuna chiave" che un blob mandato come chiave a un servizio. */
function decifra(valore) {
  if (!giaCifrato(valore)) return valore;
  try {
    const [iv, tag, cifrato] = valore.slice(PREFISSO.length).split(':').map((p) => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', chiave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cifrato), d.final()]).toString('utf8');
  } catch {
    if (typeof strapi !== 'undefined') strapi.log.warn('Chiavi AI: una chiave salvata non si decifra (segreto cambiato?): va reinserita');
    return '';
  }
}

/** Cifra, in place, i campi chiave presenti in `data` (create/update). */
function cifraDati(data) {
  if (!data) return;
  for (const campo of CAMPI) if (typeof data[campo] === 'string') data[campo] = cifra(data[campo]);
}

/** Da chiamare in `register`: cifra ogni scrittura, da REST come dall'admin. */
function registra(strapi) {
  strapi.db.lifecycles.subscribe({
    models: [USER_UID],
    beforeCreate: (event) => cifraDati(event.params.data),
    beforeUpdate: (event) => cifraDati(event.params.data),
  });
}

/** Da chiamare in `bootstrap`: cifra le chiavi ancora in chiaro (vecchie
 *  installazioni). Idempotente: dopo la prima volta non trova più nulla. */
async function cifraEsistenti(strapi) {
  if (!segreto()) {
    strapi.log.warn('Chiavi AI: né AI_KEYS_SECRET né ENCRYPTION_KEY impostati, le chiavi restano in chiaro nel database');
    return;
  }
  const utenti = await strapi.db.query(USER_UID).findMany({ select: ['id', ...CAMPI] });
  let n = 0;
  for (const u of utenti) {
    const daCifrare = CAMPI.filter((c) => u[c] && !giaCifrato(u[c]));
    if (!daCifrare.length) continue;
    // Passa dal lifecycle `beforeUpdate`, che fa la cifratura vera.
    await strapi.db.query(USER_UID).update({ where: { id: u.id }, data: Object.fromEntries(daCifrare.map((c) => [c, u[c]])) });
    n += daCifrare.length;
  }
  if (n) strapi.log.info(`Chiavi AI: ${n} chiavi in chiaro cifrate`);
}

module.exports = { cifra, decifra, cifraDati, registra, cifraEsistenti, PREFISSO };
