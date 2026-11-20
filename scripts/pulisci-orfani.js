#!/usr/bin/env node
'use strict';

// Pulizia una tantum dei record orfani lasciati dalle eliminazioni fatte PRIMA
// che esistesse la cascata (src/cascata.js): categorie senza wallet, transazioni
// senza categoria, salvadanaio senza wallet, consigli senza categoria.
//
//   node scripts/pulisci-orfani.js                          ANTEPRIMA: elenca, non cancella
//   node scripts/pulisci-orfani.js --elimina                cancella gli orfani
//   node scripts/pulisci-orfani.js --elimina --wallet-senza-utente
//                                                           cancella anche i wallet senza
//                                                           proprietario, con tutto il loro contenuto
//
// Nel container in esecuzione (legge le stesse variabili del server):
//   docker exec budget-api node scripts/pulisci-orfani.js
//
// Prima di --elimina fai un backup del database: la cancellazione non si annulla.
//
// Non apre porte e non avvia il cron: `load()` fa solo register e bootstrap. Il
// bootstrap esegue i seed dell'app (permessi, cifratura delle chiavi AI), che
// sono idempotenti e li farebbe comunque il prossimo avvio del server.

const { trovaOrfani, eliminaOrfani } = require('../src/cascata');

const args = new Set(process.argv.slice(2));
const ignoti = [...args].filter((a) => !['--elimina', '--wallet-senza-utente', '--help', '-h'].includes(a));

if (args.has('--help') || args.has('-h') || ignoti.length) {
  if (ignoti.length) console.error(`Opzione sconosciuta: ${ignoti.join(' ')}\n`);
  console.log(require('node:fs').readFileSync(__filename, 'utf8').split('\n').slice(3, 18).map((r) => r.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(ignoti.length ? 1 : 0);
}

const righe = (titolo, n, esempi = []) => {
  console.log(`  ${String(n).padStart(6)}  ${titolo}`);
  for (const e of esempi.slice(0, 8)) console.log(`          · ${e}`);
  if (esempi.length > 8) console.log(`          · … e altri ${esempi.length - 8}`);
};

function stampa(o) {
  console.log('\nOrfani trovati');
  righe('categorie senza portafoglio', o.categorie.length, o.categorie.map((c) => `${c.Nome ?? '(senza nome)'}  [${c.documentId}]`));
  righe('transazioni senza categoria (o di categorie orfane)', o.transazioni);
  righe('voci di salvadanaio senza portafoglio', o.salvadanaio);
  righe('consigli senza categoria (o di categorie orfane)', o.consigli);
  console.log(`  ${'-'.repeat(6)}`);
  righe('TOTALE righe orfane', o.totale);

  if (o.walletSenzaUtente.length) {
    console.log('\nPortafogli SENZA proprietario (non contati sopra, non si toccano senza --wallet-senza-utente)');
    for (const w of o.walletSenzaUtente) {
      console.log(`  · "${w.Nome ?? '(senza nome)'}"  [${w.documentId}]  ${w.categorie} categorie, ${w.transazioni} transazioni`);
    }
    console.log('  Possono essere dati vecchi, di prima che esistesse il campo proprietario: controllali prima.');
  }
}

async function main() {
  const { compileStrapi, createStrapi } = require('@strapi/strapi');
  const app = await createStrapi(await compileStrapi()).load();
  let codice = 0;
  try {
    const walletSenzaUtente = args.has('--wallet-senza-utente');
    const prima = await trovaOrfani(app);
    stampa(prima);

    const daFare = prima.totale + (walletSenzaUtente ? prima.walletSenzaUtente.length : 0);
    if (!args.has('--elimina')) {
      console.log(daFare ? '\nAnteprima: non ho cancellato nulla. Per eliminare: --elimina (dopo un backup del database).' : '\nNiente da pulire.');
    } else if (!daFare) {
      console.log('\nNiente da pulire.');
    } else {
      console.log('\nElimino…');
      const eliminati = await eliminaOrfani(app, { walletSenzaUtente });
      console.log('Eliminate:', Object.entries(eliminati).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nulla');
      const dopo = await trovaOrfani(app);
      if (dopo.totale) {
        console.error(`\nATTENZIONE: restano ${dopo.totale} righe orfane. Riesegui lo script e, se persistono, segnalalo.`);
        codice = 2;
      } else {
        console.log('Verifica: nessun orfano rimasto.');
      }
    }
  } finally {
    await app.destroy();
  }
  process.exit(codice);
}

main().catch((e) => {
  console.error('Pulizia non riuscita:', e.message);
  process.exit(1);
});
