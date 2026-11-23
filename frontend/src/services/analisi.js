import { api, erroreLeggibile } from "./api.js";

// Deve stare SOPRA il tetto del server (AI_BUDGET_MS, 2 minuti) e sotto quello
// del reverse proxy: chi molla per primo decide cosa vede l'utente, e deve
// essere sempre il server, che sa consegnare un report parziale. Aspettare
// più a lungo del server significa solo fissare uno spinner per una risposta
// già arrivata o già persa.
const TIMEOUT = 3 * 60 * 1000;

/**
 * Carica 1..N estratti conto (PDF o CSV, anche da conti diversi): il backend
 * unisce il testo di tutti e produce un unico report. `mese` = "YYYY-MM".
 */
export async function analizzaEstratti({ files, walletId, mese, estratto }) {
  const form = new FormData();
  form.append("walletId", walletId);
  form.append("mese", mese);
  // Condiviso: "mio" (solo i movimenti pagati o ricevuti da me) o "cassa"
  if (estratto) form.append("estratto", estratto);
  // Tutti sotto il campo "pdf", CSV compresi: lato server diventano un array.
  for (const f of files) form.append("pdf", f, f.name);

  const { data } = await api.post("/api/analisi-estratto-conto", form, { timeout: TIMEOUT });
  return data?.data ?? data; // Strapi a volte wrappa in { data, meta }
}

/** Messaggio leggibile, senza incollare in pagina il corpo della risposta: i
 *  5xx del reverse proxy arrivano come pagina HTML. */
export function erroreAnalisi(e) {
  switch (e?.response?.status) {
    case 502:
    case 503:
    case 504:
      return "L'analisi ha superato il tempo massimo e il server ha chiuso la connessione. Riprova, oppure carica un documento alla volta.";
    case 413:
      return "I documenti sono troppo grandi per il server.";
    case 403:
      return "Il tuo utente non è autorizzato ad analizzare gli estratti conto.";
    case 404:
      return "Portafoglio non trovato.";
  }
  return erroreLeggibile(e);
}
