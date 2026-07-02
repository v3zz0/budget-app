import { defineStore } from "pinia";
import axios from "axios";

/**
 * Store per la gestione dell'autenticazione utilizzando Pinia
 * Gestisce lo stato dell'autenticazione, il token JWT e le informazioni dell'utente
 */
export const useAuthStore = defineStore("auth", {
  // Stato iniziale dello store
  state: () => ({
    // Stato corrente dell'autenticazione ('', 'loading', 'success', 'error')
    status: "",
    // Token JWT recuperato dal localStorage o vuoto se non presente
    token: localStorage.getItem("token") || "",
    // Oggetto contenente le informazioni dell'utente (recuperato da localStorage)
    userInfo: JSON.parse(localStorage.getItem("userInfo") || "{}"),
  }),

  // Actions per la gestione delle operazioni asincrone e modifiche allo stato
  actions: {
    /**
     * Gestisce il login dell'utente
     * @param {Object} user - Oggetto contenente le credenziali dell'utente
     * @returns {Promise} Promise contenente la risposta del server
     */
    async login(user) {
      // Imposta lo stato su 'loading' prima della chiamata API
      this.status = "loading";

      try {
        // 1. Prima chiamata: login normale
        const resp = await axios.post("/api/auth/local", user);

        const token = resp.data.jwt;
        this.token = token;

        // 2. Configura subito il token per le prossime chiamate
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        // 3. Seconda chiamata: ottieni i dati completi dell'utente con il ruolo
        const userDataResp = await axios.get("/api/users/me?populate=role");

        this.userInfo = userDataResp.data;

        this.status = "success";

        // 4. Salva il token e userInfo nel localStorage
        localStorage.setItem("token", token);
        localStorage.setItem("userInfo", JSON.stringify(userDataResp.data));

        return resp;
      } catch (err) {
        // In caso di errore, resetta lo stato e rimuove il token
        this.status = "error";
        this.token = "";
        this.userInfo = {};
        localStorage.removeItem("token");
        localStorage.removeItem("userInfo");
        delete axios.defaults.headers.common["Authorization"];

        throw err;
      }
    },

    /**
     * Gestisce la registrazione di un nuovo utente
     * @param {Object} user - Dati del nuovo utente
     * @returns {Promise} Promise contenente la risposta del server
     */
    async register(user) {
      this.status = "loading";
      try {
        const resp = await axios.post("/api/auth/local/register", user);

        const token = resp.data.jwt;
        this.token = token;

        // Configura il token per le prossime chiamate
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        // Ottieni dati completi utente con ruolo
        const userDataResp = await axios.get("/api/users/me?populate=role");

        this.userInfo = userDataResp.data; // ← CORRETTO: dati completi con ruolo
        this.status = "success";

        localStorage.setItem("token", token);
        localStorage.setItem("userInfo", JSON.stringify(userDataResp.data));

        return resp;
      } catch (err) {
        this.status = "error";
        this.token = "";
        this.userInfo = {};
        localStorage.removeItem("token");
        localStorage.removeItem("userInfo");
        delete axios.defaults.headers.common["Authorization"];

        throw err;
      }
    },

    /**
     * Gestisce la richiesta di reset password
     * @param {Object} user - Oggetto contenente l'email dell'utente
     * @returns {Promise} Promise contenente la risposta del server
     */
    async forgotPassword(user) {
      this.status = "loading";

      try {
        const resp = await axios.post("/api/auth/forgot-password", user);

        this.status = "success";
        return resp;
      } catch (err) {
        this.status = "error";
        throw err;
      }
    },

    /**
     * Gestisce il reset effettivo della password
     * @param {Object} user - Oggetto contenente il token e la nuova password
     * @returns {Promise} Promise contenente la risposta del server
     */
    async resetPassword(user) {
      this.status = "loading";

      try {
        const resp = await axios.post("/api/auth/reset-password", user);

        const token = resp.data.jwt;
        this.token = token;

        // Configura il token per le prossime chiamate
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        // Ottieni dati completi utente con ruolo
        const userDataResp = await axios.get("/api/users/me?populate=role");

        this.userInfo = userDataResp.data;
        this.status = "success";

        localStorage.setItem("token", token);
        localStorage.setItem("userInfo", JSON.stringify(userDataResp.data));

        return resp;
      } catch (err) {
        this.status = "error";
        this.token = "";
        this.userInfo = {};
        localStorage.removeItem("token");
        localStorage.removeItem("userInfo");
        delete axios.defaults.headers.common["Authorization"];

        throw err;
      }
    },

    /**
     * Gestisce il logout dell'utente
     * Rimuove il token e resetta lo stato
     */
    logout() {
      this.status = "";
      this.token = "";
      this.userInfo = {};
      localStorage.removeItem("token");
      localStorage.removeItem("userInfo");
      delete axios.defaults.headers.common["Authorization"];
    },

    /**
     * Inizializza le headers di autorizzazione per axios
     * Da chiamare all'avvio dell'applicazione
     */
    initializeAuth() {
      const token = this.token;
      if (token) {
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      }
    },
    async fetchUserInfo() {
      if (!this.token) {
        return;
      }

      try {
        const userDataResp = await axios.get("/api/users/me?populate=role");
        this.userInfo = userDataResp.data;
        // Salva anche nel localStorage
        localStorage.setItem("userInfo", JSON.stringify(userDataResp.data));
      } catch (err) {
        console.error(" Errore recupero userInfo:", err);
        // Se il token è scaduto, pulisci tutto
        this.logout();
      }
    },
    /**
     * Verifica se l'utente può accedere a una determinata route in base al suo ruolo
     * @param {string} routeName - Nome della route da verificare
     * @param {Array} allowedRoles - Array di ruoli autorizzati per quella route
     * @returns {boolean} True se l'utente può accedere, false altrimenti
     */
    canAccessRoute(allowedRoles = []) {
      // Se non ci sono restrizioni, tutti possono accedere
      if (!allowedRoles || allowedRoles.length === 0) {
        return true;
      }

      const userRole = this.userRole;

      // Se l'utente non ha un ruolo, blocca l'accesso
      if (!userRole) {
        return false;
      }

      // Verifica se il ruolo dell'utente è nell'array dei ruoli autorizzati
      return allowedRoles.includes(userRole);
    },
  },

  // Getters per accedere allo stato in modo computato
  getters: {
    // Verifica se l'utente è loggato (true se esiste un token)
    isLoggedIn: (state) => !!state.token,
    // Restituisce lo stato corrente dell'autenticazione
    authStatus: (state) => state.status,
    // Restituisce le informazioni dell'utente
    user: (state) => state.userInfo,
    // Strapi restituisce il ruolo in state.userInfo.role.type
    userRole: (state) => {
      return state.userInfo?.role?.type || null;
    },
    // Verifica se l'utente è Admin
    isAdmin: (state) => {
      return state.userInfo?.role?.type === "authenticated";
    },
    // Verifica se l'utente è Operatore
    isOperatore: (state) => {
      return state.userInfo?.role?.type === "Operatore";
    },

    // Verifica se l'utente è Viewer (solo visualizzazione)
    isViewer: (state) => {
      return state.userInfo?.role?.type === "Visualizzatore";
    },
  },
});
