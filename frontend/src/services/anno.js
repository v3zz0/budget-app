import { elencaTutte } from "./api.js";
import { caricaRighe } from "./transazioniQuery.js";
import { calcolaAnno } from "@/utils/anno.js";

/**
 * Riepilogo annuale di un portafoglio. `mancanti` > 0 = il server dichiarava
 * più transazioni di quelle raccolte: il totale sarebbe più basso del vero.
 */
export async function caricaAnno(walletId, anno) {
  const [esito, categorie] = await Promise.all([
    caricaRighe({ dal: `${anno}-01-01`, al: `${anno}-12-31`, walletId }),
    // Le categorie danno i budget, anche per quelle senza spese.
    elencaTutte("/api/categories", { filters: { wallet: { documentId: { $eq: walletId } } } }),
  ]);
  return {
    riepilogo: calcolaAnno({ anno, righe: esito.righe, categorie }),
    righe: esito.righe,
    mancanti: Math.max(esito.totale - esito.righe.length, 0),
  };
}
