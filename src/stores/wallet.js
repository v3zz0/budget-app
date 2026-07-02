import { defineStore } from "pinia";

export const useWalletStore = defineStore("wallet", {
  // STATE = i dati sulla lavagna
  state: () => ({
    wallets: [], // tutti i wallet caricati da Strapi
    selectedWallet: null, // il wallet attualmente selezionato
  }),

  // GETTERS = dati calcolati (come le computed nei componenti)
  getters: {
    // Scorciatoia per sapere se c'è un wallet selezionato
    hasWallet: (state) => !!state.selectedWallet,

    // Scorciatoia per ottenere solo l'ID del wallet selezionato
    walletId: (state) => state.selectedWallet?.documentId || null,
  },

  // ACTIONS = le funzioni che modificano i dati
  actions: {
    // Chiamata quando l'utente seleziona un wallet dal Select
    setSelectedWallet(wallet) {
      this.selectedWallet = wallet;
      // Salva anche nel localStorage così al refresh della pagina
      // il wallet rimane selezionato
      localStorage.setItem("selectedWallet", JSON.stringify(wallet));
    },

    // Chiamata dopo aver caricato i wallet da Strapi
    setWallets(wallets) {
      this.wallets = wallets;

      // Se non c'è nessun wallet selezionato, ne seleziona uno
      if (!this.selectedWallet && wallets.length > 0) {
        // Prima controlla se c'era un wallet salvato nel localStorage
        const saved = localStorage.getItem("selectedWallet");

        if (saved) {
          const parsed = JSON.parse(saved);
          // Verifica che quel wallet esista ancora nella lista
          const found = wallets.find((w) => w.documentId === parsed.documentId);
          // Se lo trova usa quello, altrimenti usa il primo della lista
          this.selectedWallet = found || wallets[0];
        } else {
          // Nessun salvataggio → seleziona il primo wallet
          this.selectedWallet = wallets[0];
        }
      }
    },
  },
});
