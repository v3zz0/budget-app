import { defineStore } from "pinia";
import { annullaConsiglio, applicaConsiglio, elencaConsigli, segnaConsiglio } from "@/services/consigli.js";
import { erroreLeggibile } from "@/services/api.js";

let ultima = 0; // solo l'ultima richiesta scrive; il logout la invalida

export const useConsigliStore = defineStore("consigli", {
  state: () => ({ lista: [], loading: false, errore: null }),

  getters: {
    // pallini sulla campanella
    nonLetti: (s) => s.lista.filter((c) => c.stato === "nuovo").length,
    // pallino della campanella: quelli ancora da accettare o ignorare (progetto.md §19)
    daGuardare: (s) => s.lista.filter((c) => c.stato === "nuovo" || c.stato === "letto").length,
  },

  actions: {
    async carica() {
      const n = ++ultima;
      this.loading = true;
      try {
        const lista = await elencaConsigli();
        if (n === ultima) {
          this.lista = lista;
          this.errore = null;
        }
      } catch (e) {
        // Un errore sui consigli non deve rovinare la home: lista vuota e
        // nessuna campanella, l'errore resta qui per chi vuole mostrarlo.
        if (n === ultima) {
          this.lista = [];
          this.errore = erroreLeggibile(e);
        }
      } finally {
        if (n === ultima) this.loading = false;
      }
    },

    // applica/ignora lanciano: li chiama la vista, che mostra l'errore.
    async applica(c) {
      await applicaConsiglio(c.documentId);
      this.lista = this.lista.filter((x) => x.documentId !== c.documentId);
    },

    async annulla(c) {
      await annullaConsiglio(c.documentId);
      await this.carica();
    },

    async ignora(c) {
      await segnaConsiglio(c.documentId, "ignorato");
      this.lista = this.lista.filter((x) => x.documentId !== c.documentId);
    },

    // Spegne il pallino: i consigli restano, ma non sono più "nuovi". Se una
    // chiamata fallisce pazienza, quel pallino resta acceso.
    async segnaTuttiLetti() {
      await Promise.allSettled(
        this.lista
          .filter((c) => c.stato === "nuovo")
          .map((c) => segnaConsiglio(c.documentId, "letto").then(() => (c.stato = "letto"))),
      );
    },

    reset() {
      ultima++;
      this.$reset();
    },
  },
});
