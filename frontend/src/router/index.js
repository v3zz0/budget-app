import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth.js";
import { accessoRichiesto } from "@/utils/ritorno-notifica.js";
import Login from "../views/login.vue";
import Home from "../views/home.vue";
import Transazioni from "../views/transazioni.vue";
import Risparmio from "../views/risparmio.vue";
import Consigli from "../views/consigli.vue";
import Anno from "../views/anno.vue";
import Analisi from "../views/analisi.vue";
import Impostazioni from "../views/impostazioni/indice.vue";

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
    // Impostazioni: una pagina, una sezione per hash (#profilo, #ai...).
    // I vecchi indirizzi (e i link delle notifiche) portano alla sezione giusta.
    { path: "/impostazioni", name: "impostazioni", component: Impostazioni },
    ...["profilo", "portafogli", "categorie", "ai", "notifiche"].map((s) => ({
      path: `/impostazioni/${s}`,
      redirect: (to) => ({ path: "/impostazioni", hash: `#${s}`, query: to.query }),
    })),
    { path: "/ricorrenti", redirect: (to) => ({ path: "/impostazioni", hash: "#ricorrenti", query: to.query }) },
    { path: "/export", redirect: { path: "/impostazioni", hash: "#export" } },
    { path: "/:catchAll(.*)", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const loggato = useAuthStore().isLoggedIn;
  if (!to.meta.pubblica && !loggato) return accessoRichiesto(to);
  if (to.name === "Login" && loggato) return { name: "home" };
});
