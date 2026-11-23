'use strict';

// Conto tra le due persone di un portafoglio condiviso (progetto.md §12).
// Funzione pura. REPLICATA in frontend/src/utils/conti.js: se cambia una,
// cambiare l'altra (stessi test, stesso esempio di §12).
//
// Tutto è dal punto di vista di CHI HA CREATO il portafoglio:
//   q = quota del creatore nel movimento (0..1), salvata sulla transazione
//   r = quota del creatore nella cassa comune, salvata sulla transazione
//   pagatoDa = "creatore" | "membro" | "cassa"
// Risultato positivo = il membro deve soldi al creatore.
//
// Centesimi: si arrotonda a 2 decimali la parte del creatore (q·A, r·A) e
// all'altra persona va il resto, così le due parti sommano sempre ad A.

const c2 = (n) => Math.round(n * 100) / 100 || 0; // || 0: niente "-0"

/** Effetto di un movimento sul conto tra voi (vista del creatore). */
function effetto({ tipo, importo, pagatoDa, quota, quotaCassa }, regola = 0.5) {
  const A = c2(Number(importo) || 0);
  const q = quota == null ? regola : Number(quota);
  const r = quotaCassa == null ? regola : Number(quotaCassa);
  const parteQ = c2(q * A); // parte del creatore nel movimento
  const parteR = c2(r * A); // parte del creatore nella cassa
  switch (tipo) {
    case 'uscita':
      return pagatoDa === 'creatore' ? c2(A - parteQ) : pagatoDa === 'membro' ? -parteQ : c2(parteR - parteQ);
    case 'entrata':
      return pagatoDa === 'creatore' ? -c2(A - parteQ) : pagatoDa === 'membro' ? parteQ : c2(parteQ - parteR);
    case 'versamento':
      return pagatoDa === 'creatore' ? c2(A - parteR) : -parteR;
    case 'rimborso':
      return pagatoDa === 'creatore' ? A : -A;
    default:
      return 0;
  }
}

/** Somma di TUTTI i movimenti: i debiti si portano avanti fino al pareggio. */
const bilancio = (movimenti, regola = 0.5) => c2(movimenti.reduce((s, m) => s + effetto(m, regola), 0));

/** Saldo della cassa comune. */
const saldoCassa = (movimenti) =>
  c2(movimenti.reduce((s, m) => {
    const A = Number(m.importo) || 0;
    if (m.tipo === 'versamento') return s + A;
    if (m.pagatoDa !== 'cassa') return s;
    return m.tipo === 'entrata' ? s + A : m.tipo === 'uscita' ? s - A : s;
  }, 0));

/** Quota del creatore secondo la regola del portafoglio. */
function quotaRegola({ regolaTipo, quotaCreatore, entrateCreatore, entrateMembro }) {
  if (regolaTipo === 'proporzionale') {
    const tot = (Number(entrateCreatore) || 0) + (Number(entrateMembro) || 0);
    return tot > 0 ? c2((Number(entrateCreatore) || 0) / tot) : 0.5;
  }
  if (regolaTipo === 'personalizzata') {
    const q = Number(quotaCreatore);
    return Number.isFinite(q) ? Math.min(1, Math.max(0, c2(q))) : 0.5;
  }
  return 0.5;
}

module.exports = { effetto, bilancio, saldoCassa, quotaRegola };
