import { defineStore } from "pinia";
import { api } from "@/services/api.js";
import { disattivaNotifiche } from "@/services/notifiche.js";
import { useWalletStore } from "./wallet.js";
import { useDashboardStore } from "./dashboard.js";
import { useConsigliStore } from "./consigli.js";
import { impostaTema } from "@/tema.js";

const leggiUtente = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo")) || {};
  } catch {
    return {};
  }
};

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("token") || "",
    userInfo: leggiUtente(),
  }),

  getters: {
    isLoggedIn: (s) => !!s.token,
  },

  actions: {
    // credenziali = { identifier, password }
    async login(credenziali) {
      const { data } = await api.post("/api/auth/local", credenziali);
      this.token = data.jwt;
      localStorage.setItem("token", data.jwt);
      try {
        await this.fetchUserInfo();
      } catch (e) {
        this.logout();
        throw e;
      }
      // La preferenza salvata sull'utente vale su ogni dispositivo
      if (this.userInfo.tema) impostaTema(this.userInfo.tema);
    },

    async fetchUserInfo() {
      const { data } = await api.get("/api/users/me");
      this.userInfo = data;
      localStorage.setItem("userInfo", JSON.stringify(data));
    },

    /** Tema scelto: sul dispositivo subito, sull'utente in background. */
    salvaTema(t) {
      impostaTema(t);
      if (!this.userInfo.id) return;
      this.userInfo = { ...this.userInfo, tema: t };
      localStorage.setItem("userInfo", JSON.stringify(this.userInfo));
      api.put(`/api/users/${this.userInfo.id}`, { tema: t }).catch(() => {});
    },

    logout() {
      if (this.token) disattivaNotifiche(this.token).catch(() => {});
      this.token = "";
      this.userInfo = {};
      localStorage.removeItem("token");
      localStorage.removeItem("userInfo");
      // I dati in memoria sono di chi se ne va: non devono restare a chi entra.
      useWalletStore().reset();
      useDashboardStore().reset();
      useConsigliStore().reset();
    },
  },
});
