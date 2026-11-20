import { defineStore } from "pinia";
import { api } from "@/services/api.js";

const CHIAVE = "walletId";

export const useWalletStore = defineStore("wallet", {
  state: () => ({
    wallets: [],
    selectedWallet: null,
    // true appena è arrivata la lista (anche vuota): distingue "non ho ancora
    // scaricato" da "non ne hai nessuno", che è il caso del primo avvio.
    caricati: false,
  }),

  getters: {
    walletId: (s) => s.selectedWallet?.documentId || null,
  },

  actions: {
    async carica() {
      const { data } = await api.get("/api/wallets");
      this.setWallets(data.data);
    },

    setSelectedWallet(wallet) {
      this.selectedWallet = wallet;
      localStorage.setItem(CHIAVE, wallet.documentId);
    },

    // Riallinea la selezione alla lista appena arrivata: quello che era
    // selezionato se esiste ancora, altrimenti l'ultimo usato, altrimenti il
    // primo. (Prima si riusava l'oggetto vecchio: dopo un cambio utente
    // restava il portafoglio di quello precedente.)
    setWallets(wallets) {
      this.wallets = wallets;
      this.caricati = true;
      const cerca = (id) => wallets.find((w) => w.documentId === id);
      this.selectedWallet =
        cerca(this.walletId) || cerca(localStorage.getItem(CHIAVE)) || wallets[0] || null;
    },

    reset() {
      this.$reset();
      localStorage.removeItem(CHIAVE);
    },
  },
});
