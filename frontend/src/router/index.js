import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth.js";
import Login from "../views/login.vue";
import Home from "../views/home.vue";
import Transazioni from "../views/transazioni.vue";
import Risparmio from "../views/risparmio.vue";
import Ricorrenti from "../views/ricorrenti.vue";
import Consigli from "../views/consigli.vue";
import Anno from "../views/anno.vue";
import Export from "../views/export.vue";
import Analisi from "../views/analisi.vue";
import Impostazioni from "../views/impostazioni/indice.vue";
import ImpostazioniProfilo from "../views/impostazioni/profilo.vue";
import ImpostazioniPortafogli from "../views/impostazioni/portafogli.vue";
import ImpostazioniCategorie from "../views/impostazioni/categorie.vue";
import ImpostazioniAi from "../views/impostazioni/ai.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: Login, meta: { pubblica: true } },
    { path: "/", name: "home", component: Home },
    // id presente = modifica, assente = nuova
    { path: "/transazioni/:id?", name: "transazioni", component: Transazioni, props: true },
    { path: "/risparmio", name: "risparmio", component: Risparmio },
    { path: "/consigli", name: "consigli", component: Consigli },
    { path: "/anno", name: "anno", component: Anno },
    { path: "/analisi", name: "analisi", component: Analisi },
    // Sottopagine di Impostazioni (ricorrenti ed export ne fanno parte: hanno il link "indietro")
    { path: "/impostazioni", name: "impostazioni", component: Impostazioni },
    { path: "/impostazioni/profilo", name: "profilo", component: ImpostazioniProfilo },
    { path: "/impostazioni/portafogli", name: "portafogli", component: ImpostazioniPortafogli },
    { path: "/impostazioni/categorie", name: "categorie", component: ImpostazioniCategorie },
    { path: "/impostazioni/ai", name: "ai", component: ImpostazioniAi },
    { path: "/ricorrenti", name: "ricorrenti", component: Ricorrenti },
    { path: "/export", name: "export", component: Export },
    { path: "/:catchAll(.*)", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const loggato = useAuthStore().isLoggedIn;
  if (!to.meta.pubblica && !loggato) return { name: "Login" };
  if (to.name === "Login" && loggato) return { name: "home" };
});
