"use strict";

const cascata = require("./cascata");
const permessi = require("./permessi");
const chiaviAi = require("./chiavi-ai");
const notifiche = require("./notifiche/pianifica");
const { materializzaRicorrenti } = require("./ricorrenti");
const salvadanai = require("./salvadanai");

// Il testo del consiglio lo scrive l'LLM, ma i numeri glieli passiamo noi già
// calcolati: il modello non deve MAI decidere un importo. Se non risponde o non
// è configurato, resta una frase costruita dai numeri — il consiglio è valido
// lo stesso, cambia solo la forma.
async function testoConsiglio(llm, p, strapi) {
  const storico = p.mesiAnalizzati.map((m) => `${m.mese}: ${m.speso}€`).join(", ");
  const base =
    p.tipo === "alza"
      ? `Su "${p.categoria.Nome}" spendi regolarmente più del budget di ${p.budgetAttuale}€. Un budget di ${p.budgetProposto}€ sarebbe più realistico.`
      : `Su "${p.categoria.Nome}" resti sempre molto sotto il budget di ${p.budgetAttuale}€. Portandolo a ${p.budgetProposto}€ liberi ${(p.budgetAttuale - p.budgetProposto).toFixed(0)}€ per altro.`;

  try {
    const raw = await llm.giudizioLibero(
      `Sei un assistente finanziario personale. Scrivi UNA frase (max 25 parole) in italiano colloquiale su questa categoria di spesa.\n\n` +
        `Categoria: ${p.categoria.Nome}\n` +
        `Budget attuale: ${p.budgetAttuale}€\n` +
        `Spese degli ultimi mesi: ${storico}\n` +
        `Proposta: portare il budget a ${p.budgetProposto}€\n\n` +
        `Non inventare numeri diversi da questi. Niente preamboli.\n` +
        `Rispondi con JSON: { "testo": "..." }`,
    );
    return raw && raw.trim() ? raw.trim() : base;
  } catch (e) {
    strapi.log.warn(`Consigli: LLM non disponibile, uso il testo di base (${e.message})`);
    return base;
  }
}

module.exports = {
  register({ strapi }) {
    // Eliminare un portafoglio o una categoria elimina anche i loro figli.
    cascata.registra(strapi);
    // Le chiavi AI si salvano cifrate, da REST come dall'admin.
    chiaviAi.registra(strapi);
    notifiche.registraCron(strapi);

    strapi.cron.add({
      // A fine mese (ultimo giorno alle 23) si fanno due cose:
      //  1. si CHIUDE il mese che finisce, scrivendoci quanto è stato speso
      //     davvero — `risparmiato` non si tocca mai, quello lo decide l'utente;
      //  2. si APRE il mese successivo, a zero, pronto da compilare.
      // Ultimo giorno del mese alle 23: chiude il mese nei "Risparmi mensili"
      // di ogni wallet. Se l'utente non ha inserito il risparmio, vale
      // entrate − uscite (se positivo). Il vecchio salvadanaio non si scrive
      // più: i suoi dati li ha già portati qui la migrazione (src/salvadanai.js).
      chiudiEApriMese: {
        task: async ({ strapi }) => {
          const oggi = new Date();
          const domani = new Date(oggi);
          domani.setDate(domani.getDate() + 1);
          if (domani.getDate() !== 1) return;
          strapi.log.info("Cron chiudiEApriMese avviato");
          await salvadanai.chiudiMese(strapi, salvadanai.meseDi(oggi));
        },
        options: { rule: "0 23 28-31 * *" },
      },

      // Sempre a fine mese: rigenera i consigli sul budget.
      // Qui e non all'apertura della home perché i consigli guardano gli ultimi
      // 6 mesi: sono mensili per natura. Così l'app legge una lista già pronta
      // e l'LLM lavora una volta al mese invece che a ogni apertura.
      generaConsigli: {
        task: async ({ strapi }) => {
          const oggi = new Date();
          const domani = new Date(oggi);
          domani.setDate(domani.getDate() + 1);
          if (domani.getDate() !== 1) return;

          strapi.log.info("Cron generaConsigli avviato");
          const motore = require("./api/consiglio/services/motore-consigli")();
          const llmFactory = require("./api/analisi/services/llm-client");

          // I portafogli esclusi dalle statistiche restano fuori anche da qui:
          // servono come promemoria di scadenze (mutuo, IMU), non come spesa
          // corrente, e un consiglio del tipo "alza il budget del mutuo" non
          // ha senso. Il flag sta sul wallet e non sul telefono proprio perche'
          // questo cron gira sul server e una preferenza locale non la vedrebbe.
          const wallets = await strapi.entityService.findMany("api::wallet.wallet", {
            filters: { escludiDaStatistiche: { $ne: true } },
            populate: ["users_permissions_user"],
          });

          for (const wallet of wallets) {
            const proposte = await motore.calcola(wallet.documentId, oggi);
            if (!proposte.length) continue;

            // Il motore AI è quello scelto dal proprietario del wallet.
            const utente = wallet.users_permissions_user;
            const llm = llmFactory({
              motore: utente?.aiMotore,
              url: utente?.aiUrl,
              modello: utente?.aiModello,
              chiave: llmFactory.chiaveDiUtente(utente, utente?.aiMotore),
            });

            for (const p of proposte) {
              // Un consiglio già in lista non si ripresenta identico il mese
              // dopo: altrimenti la campanella diventa rumore e si smette di
              // guardarla.
              //
              // "letto" DEVE stare qui dentro: aprire la schermata dei consigli
              // marca automaticamente tutto come letto, quindi senza di lui un
              // consiglio guardato ma non applicato né ignorato veniva ricreato
              // identico ogni fine mese, e la lista si riempiva di doppioni.
              // "applicato" resta fuori apposta: lì il budget è cambiato, e se
              // la proposta ricompare vuol dire che serve davvero.
              const scartati = await strapi.entityService.findMany(
                "api::consiglio.consiglio",
                {
                  filters: {
                    categorie: p.categoria.id,
                    tipo: p.tipo,
                    stato: { $in: ["ignorato", "nuovo", "letto"] },
                  },
                  limit: 1,
                },
              );
              if (scartati.length > 0) continue;

              await strapi.entityService.create("api::consiglio.consiglio", {
                data: {
                  tipo: p.tipo,
                  budgetAttuale: p.budgetAttuale,
                  budgetProposto: p.budgetProposto,
                  mesiAnalizzati: p.mesiAnalizzati,
                  testo: await testoConsiglio(llm, p, strapi),
                  stato: "nuovo",
                  categorie: p.categoria.id,
                },
              });
              strapi.log.info(
                `Consiglio ${p.tipo} per "${p.categoria.Nome}": ${p.budgetAttuale} -> ${p.budgetProposto}`,
              );
            }
          }
        },
        options: { rule: "5 23 28-31 * *" },
      },

      // Ogni giorno all'alba: crea automaticamente le transazioni ricorrenti
      // "in scadenza" oggi. Per ogni template (TransazioneRicorrente=true) genera
      // un'istanza del mese corrente, se non esiste già.
      materializzaRicorrenti: {
        task: ({ strapi }) => materializzaRicorrenti(strapi),
        options: { rule: "0 6 * * *" },
      },
    });
  },
  async bootstrap({ strapi }) {
    // Un seed fallito non deve impedire l'avvio: peggio un 403 su una funzione
    // che un server che non parte.
    try {
      await permessi.seedPermessi(strapi);
    } catch (e) {
      strapi.log.error(`Permessi: seed non riuscito (${e.message})`);
    }
    // Categorie di prima del campo Tipo: sono tutte uscite. Senza questo, le
    // righe vecchie restano a NULL e i filtri `Tipo = uscita` le perdono.
    try {
      await strapi.db.query("api::categorie.categorie").updateMany({ where: { Tipo: null }, data: { Tipo: "uscita" } });
      await strapi.db.query("api::categorie.categorie").updateMany({ where: { Nascosta: null }, data: { Nascosta: false } });
    } catch (e) {
      strapi.log.error(`Categorie: Tipo di default non applicato (${e.message})`);
    }
    // Salvadanaio a cartelle: la cartella standard per ogni wallet e i
    // risparmi del vecchio salvadanaio portati nei suoi movimenti (idempotente).
    try {
      await salvadanai.migraVecchio(strapi);
    } catch (e) {
      strapi.log.error(`Salvadanaio: migrazione non riuscita (${e.message})`);
    }
    // Cifra le chiavi AI rimaste in chiaro dalle versioni precedenti.
    try {
      await chiaviAi.cifraEsistenti(strapi);
    } catch (e) {
      strapi.log.error(`Chiavi AI: migrazione non riuscita (${e.message})`);
    }
  },
};
