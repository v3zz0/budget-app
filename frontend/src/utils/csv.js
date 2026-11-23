// Una riga per transazione, niente righe di riepilogo mescolate: il file serve
// a un foglio di calcolo o a un agente, e due tipi di riga costringerebbero chi
// legge a indovinare quale sta guardando.
//
// Formato per Excel in italiano (progetto.md §11): separatore ";", importi
// "1.850,00", BOM UTF-8 in testa così gli accenti arrivano giusti.
// Escaping su OGNI campo di testo: anche il nome di una categoria o di un
// portafoglio può contenere un ";" o delle virgolette.
const campo = (v) => `"${String(v ?? "").replace(/[\r\n]+/g, " ").replaceAll('"', '""')}"`;
const siNo = (b) => (b ? "si" : "no");
const nf = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const numero = (n) => nf.format(Number(n) || 0);

export const COLONNE = ["data", "tipo", "importo", "descrizione", "categoria", "budget_categoria", "portafoglio", "ricorrente", "contanti"];

/** righe = forma di services/transazioniQuery.js. Date ISO, ordinabili. */
export function generaCsv(righe) {
  const corpo = righe.map((r) =>
    [
      r.data,
      r.tipo || "uscita",
      numero(r.importo),
      campo(r.descrizione),
      campo(r.categoria),
      numero(r.budgetCategoria),
      campo(r.portafoglio),
      siNo(r.ricorrente),
      siNo(r.contanti),
    ].join(";"),
  );
  return "\uFEFF" + [COLONNE.join(";"), ...corpo].join("\r\n") + "\r\n";
}
