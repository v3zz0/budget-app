import { defineStore } from "pinia";
import { api } from "@/services/api.js";
import { persona } from "@/utils/persone.js";
import { useAuthStore } from "./auth.js";

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
    /** Io, come persona (nome visualizzato, foto, colore). */
    io: () => persona(useAuthStore().userInfo),
    /** Il mio ruolo in un portafoglio: "creatore" o "membro". */
    mioRuolo: () => (w) => (w?.membro?.id && w.membro.id === useAuthStore().userInfo?.id ? "membro" : "creatore"),
    /** Ho creato io questo portafoglio? (nel condiviso solo il creatore lo elimina) */
    creatoDaMe() {
      return (w) => this.mioRuolo(w) === "creatore";
    },
    /** L'altra persona di un portafoglio condiviso, o null. Il lilla è suo. */
    partnerDi() {
      return (w) => {
        if (!w?.condiviso) return null;
        const altro = this.mioRuolo(w) === "creatore" ? w.membro : w.users_permissions_user;
        return altro ? persona(altro, "lilla") : null;
      };
    },
    /** Persona di un ruolo nel portafoglio ("creatore" | "membro" | "cassa"). */
    personaDi() {
      return (w, r) => (r === "cassa" ? "cassa" : r === this.mioRuolo(w) ? this.io : this.partnerDi(w));
    },
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
