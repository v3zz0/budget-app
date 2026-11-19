import { api } from "./api.js";
import { primoDelMese } from "@/utils/budget.js";

const URL = "/api/salvadanaios";

/**
 * Ultimi 24 mesi del portafoglio, in ordine cronologico.
 *
 * Si chiede desc e si rigira, NON asc: con `asc` il limite taglierebbe i mesi
 * più recenti. Dal 25° record il mese corrente sparirebbe dalla lista e
 * salvare il risparmio creerebbe un secondo record per lo stesso mese invece
 * di aggiornare quello esistente.
 */
export async function elencaSalvadanaio(walletId) {
  const { data } = await api.get(URL, {
    params: {
      filters: { wallet: { documentId: { $eq: walletId } } },
      sort: "mese:desc",
      pagination: { page: 1, pageSize: 24 },
    },
  });
  return data.data.reverse();
}

/**
 * Salva il risparmio del mese corrente: aggiorna il record se esiste già,
 * altrimenti lo crea. La chiave mese è il primo del mese, come nel cron.
 * `risparmiato` lo decide l'utente, il cron non lo tocca mai.
 */
export async function salvaRisparmio(walletId, esistente, risparmiato) {
  if (esistente) {
    const { data } = await api.put(`${URL}/${esistente.documentId}`, { data: { risparmiato } });
    return data.data;
  }
  const oggi = new Date();
  const { data } = await api.post(URL, {
    data: { wallet: walletId, mese: primoDelMese(oggi.getFullYear(), oggi.getMonth() + 1), risparmiato },
  });
  return data.data;
}
