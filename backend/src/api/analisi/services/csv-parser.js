'use strict';

// CSV generico di un estratto conto: lettura esatta, senza AI.
//
// Riconosce un'intestazione con una colonna data, una descrizione e un
// importo con segno (oppure due colonne "dare/avere" o "uscite/entrate").
// Separatore ";" o ","; date gg/mm/aaaa o aaaa-mm-gg; importi all'italiana
// ("-1.234,56") o all'inglese ("-1234.56"). Se l'intestazione non c'è o non si
// capisce, ritorna [] e l'analisi passa all'LLM come prima.

const norma = (s) => String(s || '').trim().toLowerCase().replace(/^"|"$/g, '');

function dividi(riga, sep) {
  const out = [];
  let cur = '';
  let virgolette = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      if (virgolette && riga[i + 1] === '"') { cur += '"'; i++; } else virgolette = !virgolette;
    } else if (c === sep && !virgolette) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function numero(s) {
  let t = String(s || '').replace(/[€\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function data(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const trova = (intest, nomi) => intest.findIndex((h) => nomi.some((n) => h === n || h.startsWith(n)));

module.exports = () => ({
  parse(testo) {
    const righe = String(testo || '').split(/\r?\n/).map((r) => r.replace(/^﻿/, '')).filter((r) => r.trim() && !r.startsWith('### '));
    if (righe.length < 2) return [];
    const sep = (righe[0].match(/;/g) || []).length >= (righe[0].match(/,/g) || []).length ? ';' : ',';
    const intest = dividi(righe[0], sep).map(norma);
    const iData = trova(intest, ['data operazione', 'data contabile', 'data']);
    const iDesc = trova(intest, ['descrizione', 'causale', 'operazione', 'dettagli']);
    const iImp = trova(intest, ['importo', 'ammontare']);
    const iDare = trova(intest, ['dare', 'uscite', 'addebiti']);
    const iAvere = trova(intest, ['avere', 'entrate', 'accrediti']);
    if (iData < 0 || iDesc < 0 || (iImp < 0 && iDare < 0 && iAvere < 0)) return [];

    const movimenti = [];
    for (const riga of righe.slice(1)) {
      const c = dividi(riga, sep);
      const d = data(c[iData]);
      if (!d) continue;
      let importo = iImp >= 0 ? numero(c[iImp]) : null;
      if (importo == null) {
        const dare = iDare >= 0 ? numero(c[iDare]) : null;
        const avere = iAvere >= 0 ? numero(c[iAvere]) : null;
        if (avere) importo = Math.abs(avere);
        else if (dare) importo = -Math.abs(dare);
      }
      if (!importo) continue;
      const descrizione = String(c[iDesc] || '').replace(/\s+/g, ' ').trim();
      movimenti.push(
        importo > 0
          ? { data: d, importo: Math.round(importo * 100) / 100, descrizione, tipo: 'entrata', addebitoCarta: false }
          : { data: d, importo: Math.round(-importo * 100) / 100, descrizione, addebitoCarta: false },
      );
    }
    return movimenti;
  },
});
