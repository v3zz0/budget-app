// Logica pura delle Impostazioni: validazioni, preset dei motori AI, forma del
// body da salvare. Niente Vue né rete, quindi si prova con `npm test`.

export const MOTORI = [
  {
    id: "ollama", titolo: "Server Ollama", sotto: "Il tuo mini PC. Funziona solo dalla rete di casa.", icona: "ph-hard-drives",
    dove: "In casa", esempio: "http://192.168.1.10:11434", urlHint: "il mini PC nella rete di casa", modelloHint: "installati sul server",
    locale: true, privacy: "I movimenti non escono da casa tua: il modello gira sul mini PC.",
  },
  {
    id: "llamacpp", titolo: "llama.cpp", sotto: "Server llama.cpp in locale, con API compatibile OpenAI.", icona: "ph-terminal-window",
    dove: "In locale", esempio: "http://localhost:8080", urlHint: "server llama.cpp", modelloHint: "caricato sul server",
    locale: true, privacy: "I movimenti restano sul computer che fa girare llama.cpp.",
  },
  {
    id: "openrouter", titolo: "OpenRouter", sotto: "Nel cloud, funziona ovunque. Ci sono anche modelli gratuiti.", icona: "ph-cloud",
    dove: "Cloud", esempio: "https://openrouter.ai/api/v1", urlHint: "non serve cambiarlo", modelloHint: "i gratuiti finiscono con :free",
    locale: false, privacy: "Descrizioni e importi dei movimenti vengono inviati a OpenRouter e al fornitore del modello scelto.",
  },
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

/** Robustezza della password su tre livelli (0 = vuota). Solo un indizio visivo. */
export function forzaPassword(p = "") {
  if (!p) return 0;
  let punti = 0;
  if (p.length >= 8) punti++;
  if (p.length >= 12) punti++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) punti++;
  if (/\d/.test(p)) punti++;
  if (/[^A-Za-z0-9]/.test(p)) punti++;
  return p.length < 6 ? 1 : punti >= 4 ? 3 : punti >= 2 ? 2 : 1;
}

/** "spesa  grande" -> "Spesa grande": come si salva il nome di una categoria. */
export const nomeCategoria = (s) => {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** La categoria con lo stesso nome (maiuscole ignorate), se c'è. */
export const categoriaOmonima = (nome, categorie, escludiId = null) => {
  const n = nomeCategoria(nome).toLocaleLowerCase("it");
  return categorie.find((c) => c.documentId !== escludiId && (c.Nome || "").trim().toLocaleLowerCase("it") === n) || null;
};

/** RicorrenzaTemporale per un giorno del mese: 31 resta 31 anche dove il mese è corto. */
export const dataRicorrenza = (giorno) => `2000-01-${String(Math.min(Math.max(Number(giorno) || 1, 1), 31)).padStart(2, "0")}`;
