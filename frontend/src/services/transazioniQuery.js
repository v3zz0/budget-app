import { elencaConTotale } from "./api.js";

// Una transazione appiattita, coi nomi di categoria e portafoglio già
// risolti: la forma comoda sia per una riga di CSV sia per un totale annuo.
// Una riga senza categoria o wallet popolati resta, coi campi vuoti: una riga
// orfana che si vede è meglio di una riga sparita di nascosto.
const riga = (j) => ({
  data: j.Data,
  importo: Number(j.Importo) || 0,
  descrizione: j.Descrizione ?? "",
  categoriaId: j.categorie?.documentId ?? "",
  categoria: j.categorie?.Nome ?? "",
  // senza Tipo = categoria di prima del campo: è un'uscita
  tipo: j.categorie?.Tipo || "uscita",
  budgetCategoria: Number(j.categorie?.Budget_categoria) || 0,
  walletId: j.categorie?.wallet?.documentId ?? "",
  portafoglio: j.categorie?.wallet?.Nome ?? "",
  ricorrente: !!j.TransazioneRicorrente,
  contanti: !!j.Contanti,
});

/**
 * Sweep paginata su tutte le transazioni dell'utente, in un intervallo
 * opzionale ("YYYY-MM-DD") e per un solo portafoglio opzionale.
 *
 * Non serve ciclare i portafogli: il controller lato server filtra per
 * utente, quindi senza `walletId` una sola sweep li copre tutti.
 * Ritorna anche `totale`, quello dichiarato dal server: se `righe.length` è
 * minore, chi mostra i numeri deve dirlo.
 */
export async function caricaRighe({ dal, al, walletId } = {}) {
  const filters = {};
  if (dal || al) filters.Data = { ...(dal && { $gte: dal }), ...(al && { $lte: al }) };
  if (walletId) filters.categorie = { wallet: { documentId: { $eq: walletId } } };

  const { righe, totale } = await elencaConTotale("/api/transazionis", {
    filters,
    populate: {
      categorie: { fields: ["Nome", "Budget_categoria", "Tipo"], populate: { wallet: { fields: ["Nome"] } } },
    },
    sort: ["Data:asc", "id:asc"],
  });
  // i versamenti automatici nel salvadanaio non sono movimenti di cassa (§16)
  return { righe: righe.map(riga).filter((r) => r.tipo !== "salvadanaio"), totale: totale - righe.filter((j) => j.categorie?.Tipo === "salvadanaio").length };
}
