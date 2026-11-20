import { api, erroreLeggibile } from "./api.js";
import { riduciFoto } from "@/utils/immagine.js";

/**
 * Legge uno scontrino fotografato. La lettura (OCR) la fa il server; la foto
 * passa solo in memoria e viene cancellata subito dopo.
 * Ritorna { totale: number|null, descrizione: string|null, righeLette: string[] }.
 */
export async function leggiScontrino(file) {
  const foto = await riduciFoto(file);
  const form = new FormData();
  form.append("immagine", foto, "scontrino.jpg");
  // 90s: sopra il tetto di 60s che il server si dà per la lettura.
  const { data } = await api.post("/api/scontrino/leggi", form, { timeout: 90_000 });
  return data;
}

export function erroreScontrino(e) {
  switch (e?.response?.status) {
    case 403:
      return "Il tuo utente non può leggere gli scontrini: manca il permesso «Scontrino → leggi» nel ruolo.";
    case 404:
      return "Questo server non supporta ancora la lettura degli scontrini: aggiorna il backend.";
    case 413:
      return "La foto è troppo grande.";
    case 429:
      return "Ci sono già altre letture in corso: riprova fra qualche secondo.";
    case 504:
      return "La lettura ha impiegato troppo: riprova con una foto più nitida.";
  }
  return erroreLeggibile(e);
}
