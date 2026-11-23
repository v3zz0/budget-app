// Riepilogo annuale. Funzione pura: prende le righe già scaricate e non tocca
// la rete, così si prova senza mock.

/**
 * Quanti mesi contare per la stima del budget annuo.
 * Anno passato = 12 (due anni si confrontano sullo stesso metro). Anno in
 * corso = mesi trascorsi: ad agosto, otto mesi di spesa contro dodici di
 * budget farebbero sembrare virtuoso chiunque. Anno futuro = 0.
 */
export function mesiDaContare(anno, adesso = new Date()) {
  const corrente = adesso.getFullYear();
  if (anno < corrente) return 12;
  if (anno > corrente) return 0;
  return adesso.getMonth() + 1;
}

const somma = (serie) => serie.reduce((s, v) => s + v, 0);

/**
 * righe: transazioni normalizzate (services/transazioniQuery.js).
 * categorie: categorie Strapi del portafoglio ({documentId, Nome, Budget_categoria, icona}),
 * per i budget e per far comparire anche le categorie senza spese: una
 * categoria con budget e zero spese è un'informazione, non una riga da nascondere.
 *
 * Lo speso è RILEVATO (somma). Il budget annuo è STIMATO: il budget di
 * categoria non ha storico, esiste solo il valore di oggi.
 */
export function calcolaAnno({ anno, righe, categorie, adesso }) {
  const mesi = mesiDaContare(anno, adesso);
  const perCategoria = new Map();
  const nomi = new Map();
  const totaliMese = Array(12).fill(0);
  const entrateMese = Array(12).fill(0);

  for (const r of righe) {
    // Fuori anno non dovrebbe arrivare nulla; se un filtro cambiasse,
    // finirebbe nel totale senza che ce ne accorgiamo.
    if (Number(r.data.slice(0, 4)) !== anno) continue;
    const m = Number(r.data.slice(5, 7)) - 1;
    // Lo speso è solo delle uscite; le entrate hanno la loro serie.
    if (r.tipo === "entrata") {
      entrateMese[m] += r.importo;
      continue;
    }
    if (r.tipo && r.tipo !== "uscita") continue; // versamenti e rimborsi del condiviso
    if (!perCategoria.has(r.categoriaId)) perCategoria.set(r.categoriaId, Array(12).fill(0));
    perCategoria.get(r.categoriaId)[m] += r.importo;
    totaliMese[m] += r.importo;
    if (r.categoria) nomi.set(r.categoriaId, r.categoria);
  }

  const voce = (documentId, nome, icona, budgetMensile, serie) => {
    const speso = somma(serie);
    const budgetStimato = budgetMensile * mesi;
    return {
      documentId, nome, icona, speso, budgetMensile, budgetStimato, perMese: serie,
      // null senza budget: senza tetto non esiste una percentuale
      percentuale: budgetStimato > 0 ? speso / budgetStimato : null,
      oltreStima: budgetStimato > 0 && speso > budgetStimato,
    };
  };

  const righeCategoria = categorie.filter((c) => (c.Tipo || "uscita") === "uscita").map((c) =>
    voce(c.documentId, c.Nome, c.icona || "", c.Budget_categoria || 0,
      perCategoria.get(c.documentId) ?? Array(12).fill(0)),
  );
  // Categorie eliminate nel frattempo: le spese restano nello storico e devono
  // restare nel totale, altrimenti la somma dei mesi non torna col totale annuo.
  const note = new Set(categorie.map((c) => c.documentId));
  for (const [id, serie] of perCategoria) {
    if (!note.has(id)) righeCategoria.push(voce(id, nomi.get(id) || "Categoria eliminata", "", 0, serie));
  }
  righeCategoria.sort((a, b) => b.speso - a.speso);

  const speso = somma(totaliMese);
  return {
    anno,
    categorie: righeCategoria,
    speso,
    budgetStimato: somma(righeCategoria.map((c) => c.budgetStimato)),
    perMese: totaliMese,
    entratePerMese: entrateMese,
    entrate: somma(entrateMese),
    mesiConsiderati: mesi,
    vuoto: speso === 0,
  };
}
