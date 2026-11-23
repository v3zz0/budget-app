// Logica pura della schermata Analisi. categorie = quelle del report
// ({documentId, nome, wallet}): di TUTTI i portafogli, non solo di quello
// analizzato. L'estratto conto è del conto corrente: una rata di casa va
// registrata in "Casa" anche se stai guardando "Spese personali".

/** Quante incongruenze restano da risolvere (quelle chiuse escono dal conto). */
export const daControllare = (report, chiuse) =>
  report ? [...report.mancanti, ...report.soloApp, ...report.diversi].filter((x) => !chiuse.has(chiave(x))).length : 0;

/** Chiave stabile di una voce del report (mancante, soloApp o diverso). */
export const chiave = (x) =>
  x.app ? `d:${x.app.documentId}` : x.documentId ? `a:${x.documentId}` : `m:${x.data}:${x.importo}:${x.descrizione}`;
