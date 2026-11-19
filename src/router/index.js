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
import Impostazioni from "../views/setting.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: Login, meta: { pubblica: true } },
    { path: "/", name: "home", component: Home },
    // id presente = modifica, assente = nuova
    { path: "/transazioni/:id?", name: "transazioni", component: Transazioni, props: true, meta: { title: "Transazione" } },
    { path: "/risparmio", name: "risparmio", component: Risparmio, meta: { title: "Risparmio" } },
    { path: "/ricorrenti", name: "ricorrenti", component: Ricorrenti },
    { path: "/consigli", name: "consigli", component: Consigli },
    { path: "/anno", name: "anno", component: Anno },
    { path: "/export", name: "export", component: Export },
    { path: "/impostazioni", name: "impostazioni", component: Impostazioni, meta: { title: "Impostazioni" } },
    { path: "/:catchAll(.*)", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const loggato = useAuthStore().isLoggedIn;
  if (!to.meta.pubblica && !loggato) return { name: "Login" };
  if (to.name === "Login" && loggato) return { name: "home" };
});
