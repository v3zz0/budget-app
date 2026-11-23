// Conto tra le due persone di un portafoglio condiviso (progetto.md §12).
// REPLICA di backend/src/conti.js (che decide se si può uscire dal
// portafoglio): se cambia uno, cambiare l'altro. Stesso esempio nei test.
//
// Tutto è salvato dal punto di vista di CHI HA CREATO il portafoglio
// (quota = sua parte, pagatoDa = "creatore" | "membro" | "cassa"); chi guarda
// è "creatore" o "membro" e vede i numeri girati di conseguenza.

const c2 = (n) => Math.round(n * 100) / 100 || 0; // || 0: niente "-0"

/** Effetto di un movimento sul conto (vista del creatore): + = il membro deve al creatore. */
export function effetto({ tipo, importo, pagatoDa, quota, quotaCassa }, regola = 0.5) {
  const A = c2(Number(importo) || 0);
  const q = quota == null ? regola : Number(quota);
  const r = quotaCassa == null ? regola : Number(quotaCassa);
  const parteQ = c2(q * A);
  const parteR = c2(r * A);
  switch (tipo) {
    case "uscita":
      return pagatoDa === "creatore" ? c2(A - parteQ) : pagatoDa === "membro" ? -parteQ : c2(parteR - parteQ);
    case "entrata":
      return pagatoDa === "creatore" ? -c2(A - parteQ) : pagatoDa === "membro" ? parteQ : c2(parteQ - parteR);
    case "versamento":
      return pagatoDa === "creatore" ? c2(A - parteR) : -parteR;
    case "rimborso":
      return pagatoDa === "creatore" ? A : -A;
    default:
      return 0;
  }
}

/** Bilancio di sempre, visto da `io` ("creatore" | "membro"): + = l'altra persona mi deve. */
export const bilancio = (movimenti, io = "creatore", regola = 0.5) => {
  const b = c2(movimenti.reduce((s, m) => s + effetto(m, regola), 0));
  return io === "membro" ? c2(-b) : b;
};

/** Saldo della cassa comune. */
export const saldoCassa = (movimenti) =>
  c2(
    movimenti.reduce((s, m) => {
      const A = Number(m.importo) || 0;
      if (m.tipo === "versamento") return s + A;
      if (m.pagatoDa !== "cassa") return s;
      return m.tipo === "entrata" ? s + A : m.tipo === "uscita" ? s - A : s;
    }, 0),
  );

/** La mia parte di un movimento (0..1): quota è del creatore. */
export const miaQuota = (quota, io, regola = 0.5) => {
  const q = quota == null ? regola : Number(quota);
  return io === "membro" ? c2(1 - q) : q;
};

/** Ruolo dell'altra persona. */
export const altro = (io) => (io === "creatore" ? "membro" : "creatore");

/** Quota del creatore secondo la regola del portafoglio. */
export function quotaRegola({ regolaTipo, quotaCreatore, entrateCreatore, entrateMembro }) {
  if (regolaTipo === "proporzionale") {
    const tot = (Number(entrateCreatore) || 0) + (Number(entrateMembro) || 0);
    return tot > 0 ? c2((Number(entrateCreatore) || 0) / tot) : 0.5;
  }
  if (regolaTipo === "personalizzata") {
    const q = Number(quotaCreatore);
    return Number.isFinite(q) ? Math.min(1, Math.max(0, c2(q))) : 0.5;
  }
  return 0.5;
}

/** Data dell'ultimo pareggio (conto tornato a zero), o null. movimenti in ordine di data. */
export function ultimoPareggio(movimenti, regola = 0.5) {
  let s = 0;
  let data = null;
  for (const m of movimenti) {
    const prima = s;
    s = c2(s + effetto(m, regola));
    if (Math.abs(s) < 0.005 && Math.abs(prima) >= 0.005) data = m.data;
  }
  return data;
}
