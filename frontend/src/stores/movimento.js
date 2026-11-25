import { defineStore } from "pinia";

// Foglio "Nuovo movimento" sopra la pagina (progetto.md §23).
// opz: { tipo, verso, ricorrente, id }. versione sale a ogni salvataggio:
// le pagine la guardano per ricaricare i loro dati.
export const useMovimentoStore = defineStore("movimento", {
  state: () => ({ aperto: false, opz: {}, versione: 0, ultimaData: null, n: 0 }),
  actions: {
    apri(opz = {}) {
      this.opz = opz;
      this.n++; // ogni apertura riparte da un form vuoto
      this.aperto = true;
    },
    chiudi() {
      this.aperto = false;
    },
    salvato(data) {
      this.ultimaData = data || null;
      this.versione++;
    },
  },
});
