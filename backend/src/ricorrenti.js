"use strict";

// Cron `materializzaRicorrenti` (src/index.js, ogni giorno alle 6): crea
// l'istanza del mese per ogni template TransazioneRicorrente=true in scadenza
// oggi, se non esiste già. I template in pausa si saltano.
// REPLICATO da frontend/src/utils/ricorrenza.js: se cambia uno, cambiare l'altro.
async function materializzaRicorrenti(strapi, oggi = new Date()) {
  const giornoOggi = oggi.getDate();
  const anno = oggi.getFullYear();
  const mese = String(oggi.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(anno, oggi.getMonth() + 1, 0).getDate();
  const primo = `${anno}-${mese}-01`;
  const ultimo = `${anno}-${mese}-${String(lastDay).padStart(2, "0")}`;

  const templates = await strapi
    .documents("api::transazioni.transazioni")
    .findMany({
      // In pausa: resta in elenco ma non si registra (utils/ricorrenza.js).
      // $or e non `$ne: true`: in SQL `NULL != true` è falso, e i
      // template di prima del campo (NULL) non scatterebbero più.
      filters: {
        TransazioneRicorrente: true,
        $or: [{ InPausa: false }, { InPausa: { $null: true } }],
      },
      populate: ["categorie"],
    });

  for (const t of templates) {
    if (!t.categorie) continue;
    const rif = t.RicorrenzaTemporale || t.Data;
    if (!rif) continue;

    // Scade oggi? Se il giorno non esiste nel mese (es. 31 a febbraio),
    // scatta l'ultimo giorno del mese.
    const giornoRic = new Date(rif).getDate();
    const inScadenza =
      giornoRic === giornoOggi ||
      (giornoOggi === lastDay && giornoRic > lastDay);
    if (!inScadenza) continue;

    // Anti-duplicato: c'è già una transazione con stessi categoria e
    // descrizione in questo mese? (istanza già creata, oppure il template nel
    // suo mese d'origine) → salta. L'importo NON conta: se l'utente lo cambia
    // dalle Impostazioni a mese iniziato, la modifica vale dal mese dopo
    // (progetto.md §11) e non deve nascere una seconda istanza.
    // ponytail: match per categoria+descrizione; due ricorrenti con la stessa
    //   descrizione nella stessa categoria verrebbero fuse. Per precisione:
    //   un campo che colleghi l'istanza al template.
    const esistenti = await strapi
      .documents("api::transazioni.transazioni")
      .findMany({
        filters: {
          categorie: { documentId: t.categorie.documentId },
          Descrizione: t.Descrizione,
          Data: { $gte: primo, $lte: ultimo },
        },
      });
    if (esistenti.length > 0) continue;

    const giorno = String(Math.min(giornoRic, lastDay)).padStart(2, "0");
    await strapi.documents("api::transazioni.transazioni").create({
      data: {
        Importo: t.Importo,
        Descrizione: t.Descrizione,
        Data: `${anno}-${mese}-${giorno}`,
        TransazioneRicorrente: false, // istanza materializzata, non un nuovo template
        Contanti: t.Contanti || false, // una ricorrente in contanti resta in contanti
        // Condiviso: stesso pagatore e stesse quote del template
        pagatoDa: t.pagatoDa ?? null,
        quota: t.quota ?? null,
        quotaCassa: t.quotaCassa ?? null,
        categorie: t.categorie.documentId,
      },
    });
    strapi.log.info(
      `Ricorrente materializzata: "${t.Descrizione}" ${t.Importo}€ (${anno}-${mese})`,
    );
  }
}

module.exports = { materializzaRicorrenti };
