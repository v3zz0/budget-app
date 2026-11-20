// Logica pura delle Impostazioni: validazioni, preset dei motori AI, forma del
// body da salvare. Niente Vue né rete, quindi si prova con `npm test`.

export const MOTORI = [
  { id: "ollama", titolo: "Server Ollama", sotto: "Il tuo mini PC. Solo dalla rete di casa", icona: "pi-server", esempio: "http://192.168.1.10:11434" },
  { id: "llamacpp", titolo: "llama.cpp", sotto: "Il server llama.cpp in locale. API compatibile OpenAI", icona: "pi-code", esempio: "http://localhost:8080" },
  { id: "openrouter", titolo: "OpenRouter", sotto: "Cloud, funziona ovunque. Ci sono modelli gratuiti", icona: "pi-cloud", esempio: "https://openrouter.ai/api/v1" },
];

/**
 * Cambiando motore l'indirizzo si precompila, ma senza mai sovrascrivere uno
 * scritto a mano: si tocca solo se è vuoto o se era il preset di un altro motore.
 * Per Ollama "vuoto" vale: il server usa il suo indirizzo predefinito.
 */
export function urlPerMotore(motore, url) {
  if (motore === "openrouter") return !url || url.includes("11434") ? "https://openrouter.ai/api/v1" : url;
  if (motore === "llamacpp") {
    return !url || url.includes("openrouter") || url.includes("11434") ? "http://localhost:8080" : url;
  }
  return url.includes("openrouter") || url.includes("8080") ? "" : url;
}

/** Modelli OpenRouter: i gratuiti (`:free`) in cima, poi ordine alfabetico. */
export const ordinaModelli = (ids) =>
  [...ids].sort((a, b) => Number(b.endsWith(":free")) - Number(a.endsWith(":free")) || a.localeCompare(b));

/**
 * Body del PUT /api/users/:id per le impostazioni AI. La chiave la differenzia
 * il motore (openrouter e llama.cpp sono servizi diversi: con un campo solo si
 * perderebbe una chiave a ogni cambio) e si manda SOLO se l'utente l'ha
 * (ri)scritta: non torna mai dal server, quindi vuota = lascia quella salvata.
 */
export function campiAi({ motore, url, modello }, chiave) {
  const llama = motore === "llamacpp";
  return {
    aiMotore: motore,
    aiUrl: url,
    aiModello: modello,
    ...(chiave && { [llama ? "aiChiaveLlamacpp" : "aiChiave"]: chiave, [llama ? "aiChiaveLlamacppImpostata" : "aiChiaveImpostata"]: true }),
  };
}

/** La chiave del motore scelto è già salvata sul server? */
export const chiaveImpostata = (utente, motore) =>
  !!(motore === "llamacpp" ? utente.aiChiaveLlamacppImpostata : utente.aiChiaveImpostata);

// Validazione lato client: Strapi rifiuta comunque, ma così l'errore è
// immediato e in italiano.
export const emailValida = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export function erroreProfilo({ nome, email }) {
  // 3 = minLength dello schema utente di Strapi
  if (nome.trim().length < 3) return "Il nome utente deve avere almeno 3 caratteri";
  if (!emailValida(email.trim())) return "Indirizzo email non valido";
  return null;
}

export function errorePassword(attuale, nuova) {
  if (!attuale || !nuova) return "Compila entrambi i campi password";
  // 6 = minimo di users-permissions
  if (nuova.length < 6) return "La nuova password deve avere almeno 6 caratteri";
  if (nuova === attuale) return "La nuova password è uguale a quella attuale";
  return null;
}
