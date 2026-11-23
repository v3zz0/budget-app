// Una riga per transazione, niente righe di riepilogo mescolate: il file serve
// a un foglio di calcolo o a un agente, e due tipi di riga costringerebbero chi
// legge a indovinare quale sta guardando.
//
// Escaping su OGNI campo di testo, non solo la descrizione: anche il nome di
// una categoria o di un portafoglio può contenere una virgola.
const campo = (v) => `"${String(v ?? "").replace(/[\r\n]+/g, " ").replaceAll('"', '""')}"`;
const siNo = (b) => (b ? "si" : "no");

/** righe = forma di services/transazioniQuery.js. Date ISO, ordinabili. */
export function generaCsv(righe) {
  const intestazione = "data,tipo,importo,descrizione,categoria,budget_categoria,portafoglio,ricorrente,contanti";
  const corpo = righe.map((r) =>
    [
      r.data,
      r.tipo || "uscita",
      r.importo.toFixed(2),
      campo(r.descrizione),
      campo(r.categoria),
      r.budgetCategoria.toFixed(2),
      campo(r.portafoglio),
      siNo(r.ricorrente),
      siNo(r.contanti),
    ].join(","),
  );
  return [intestazione, ...corpo].join("\n") + "\n";
}
