// Piano di un versamento nel salvadanaio (progetto.md §16). Logica pura.
import { nomeMese } from "./budget.js";

/**
 * importo, saldo e obiettivo (null = senza) del salvadanaio; ricorrente:
 * ogni mese; data "AAAA-MM-GG" del primo versamento; oggi idem.
 */
export function piano({ importo, saldo = 0, obiettivo = null, ricorrente, data, oggi }) {
  const [a, m, g] = data.split("-").map(Number);
  const dopo = Math.round((saldo + importo) * 100) / 100;
  const r = {
    primoOggi: data <= oggi,
    giorno: g,
    // dal 29 in poi, nei mesi corti si versa l'ultimo giorno (come il cron)
    meseCorto: ricorrente && g > 28,
    dopo,
    percentuale: obiettivo ? Math.min(100, (dopo / obiettivo) * 100) : null,
    raggiunto: !!obiettivo && saldo >= obiettivo,
    versamenti: null,
    arrivo: null,
    inUnAnno: ricorrente && !obiettivo ? Math.round(importo * 12 * 100) / 100 : null,
  };
  if (ricorrente && obiettivo && !r.raggiunto && importo > 0) {
    r.versamenti = Math.ceil((obiettivo - saldo) / importo);
    const fine = new Date(a, m - 1 + r.versamenti - 1, 1);
    r.arrivo = `${nomeMese(fine.getMonth() + 1).toLowerCase()} ${fine.getFullYear()}`;
  }
  return r;
}

/** Il mese dei Risparmi mensili da cui prendere `importo`: l'ultimo chiuso che basta (come il server). */
export const meseDaCuiPrendere = (mesi, meseCorrente, importo) =>
  mesi.filter((x) => x.mese < meseCorrente && x.disponibile >= importo - 0.004).map((x) => x.mese).sort().pop() || null;
