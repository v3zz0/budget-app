// Logica pura della schermata Analisi. categorie = quelle del report
// ({documentId, nome, wallet}): di TUTTI i portafogli, non solo di quello
// analizzato. L'estratto conto è del conto corrente: una rata di casa va
// registrata in "Casa" anche se stai guardando "Spese personali".

/** Categorie raggruppate per portafoglio, in ordine alfabetico: quelle di
 *  "Casa" restano vicine fra loro invece di finire sparse. */
export function raggruppaCategorie(categorie) {
  const gruppi = new Map();
  for (const c of categorie) {
    const wallet = c.wallet || "Altro";
    if (!gruppi.has(wallet)) gruppi.set(wallet, []);
    gruppi.get(wallet).push({ value: c.documentId, label: c.nome });
  }
  return [...gruppi]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wallet, items]) => ({ wallet, items: items.sort((x, y) => x.label.localeCompare(y.label)) }));
}

/** documentId della categoria che corrisponde al suggerimento dell'AI (stesso
 *  nome, senza badare alle maiuscole), o null: un suggerimento che non
 *  corrisponde a nessuna categoria esistente non si preseleziona. */
export function categoriaSuggerita(categorie, nome) {
  if (!nome) return null;
  const n = nome.toLowerCase();
  return categorie.find((c) => c.nome.toLowerCase() === n)?.documentId ?? null;
}
