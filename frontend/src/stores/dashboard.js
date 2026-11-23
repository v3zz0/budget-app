import { defineStore } from "pinia";
import { caricaConto, caricaMese } from "@/services/dashboard.js";
import { useWalletStore } from "./wallet.js";
import { erroreLeggibile } from "@/services/api.js";
import { proiezioneFineMese, spostaMese } from "@/utils/budget.js";

const meseCorrente = () => {
  const d = new Date();
  return { anno: d.getFullYear(), mese: d.getMonth() + 1 };
};

// Solo l'ultima richiesta può scrivere nello store: cambiando mese o
// portafoglio in fretta, una risposta lenta non sovrascrive quella nuova.
let ultima = 0;

const somma = (lista) => lista.reduce((s, t) => s + (t.Importo || 0), 0);

export const useDashboardStore = defineStore("dashboard", {
  state: () => ({
    mese: meseCorrente(),
    walletId: null,
    categorie: [], // ognuna con le sole transazioni del mese
    precedente: [], // lo stesso per il mese prima (variazioni nelle card della Home)
    conto: [], // condiviso: tutti i movimenti di sempre (conto tra voi, cassa)
    loading: false,
    errore: null,
  }),

  getters: {
    // Solo le uscite: un'entrata non è una spesa (e il suo budget è "previsto")
    uscite: (s) => s.categorie.filter((c) => (c.Tipo || "uscita") === "uscita"),
    totaleSpesi() {
      return this.uscite.reduce((t, c) => t + somma(c.transazionis), 0);
    },
    totaleBudget() {
      return this.uscite.reduce((t, c) => t + (c.Budget_categoria || 0), 0);
    },
    totaleRimanente() {
      return this.totaleBudget - this.totaleSpesi;
    },
    proiezione() {
      return proiezioneFineMese(this.totaleSpesi, this.mese);
    },
    // Mostrata solo se porta a sforare e i giorni trascorsi la rendono
    // credibile (al giorno 3 l'estrapolazione dice qualsiasi cosa).
    proiezionePreoccupante() {
      const p = this.proiezione;
      return p !== null && this.totaleBudget > 0 && new Date().getDate() >= 7 && p > this.totaleBudget;
    },
  },

  actions: {
    async carica(walletId = this.walletId) {
      if (!walletId) return;
      this.walletId = walletId;
      this.loading = true;
      this.errore = null;
      const n = ++ultima;
      try {
        const condiviso = useWalletStore().wallets.find((w) => w.documentId === walletId)?.condiviso;
        const [categorie, precedente, conto] = await Promise.all([
          caricaMese(walletId, this.mese),
          caricaMese(walletId, spostaMese(this.mese, -1)),
          condiviso ? caricaConto(walletId) : [],
        ]);
        if (n === ultima) Object.assign(this, { categorie, precedente, conto });
      } catch (e) {
        if (n === ultima) this.errore = erroreLeggibile(e);
      } finally {
        if (n === ultima) this.loading = false;
      }
    },

    // Al logout: azzera e scarta le richieste ancora in volo, altrimenti una
    // risposta tardiva rimetterebbe nello store i dati di chi è appena uscito.
    reset() {
      ultima++;
      this.$reset();
    },

    cambiaMese(passo) {
      this.mese = spostaMese(this.mese, passo);
      return this.carica();
    },
  },
});

export { somma };
