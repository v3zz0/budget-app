import { createRouter as createVueRouter, createWebHistory } from "vue-router";
import App from "@/App.vue";
import auth from "../middlewares/autheRoute.js";
import roleGuard from "../middlewares/roleGuard.js";
import Login from "../views/login.vue";
import Home from "../views/home.vue";
import Transazioni from "../views/transazioni.vue";
import Risparmio from "../views/risparmio.vue";
import Impostazioni from "../views/setting.vue";

// 2. Creazione delle Route
const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login,
  },
  {
    path: "/",
    name: "home",
    component: Home,
    meta: {
      middleware: [auth],
    },
  },
  {
    path: "/transazioni",
    name: "transazioni",
    component: Transazioni,
    meta: {
      middleware: [auth],
      title: "Transazioni",
    },
  },
  {
    path: "/risparmio",
    name: "risparmio",
    component: Risparmio,
    meta: {
      middleware: [auth],
      title: "Risparmio",
    },
  },
  {
    path: "/impostazioni",
    name: "Impostazioni",
    component: Impostazioni,
    meta: {
      middleware: [auth],
      title: "Impostazioni",
    },
  },

  {
    path: "/:catchAll(.*)",
    redirect: (to) => {
      // the function receives the target route as the argument
      // we return a redirect path/location here.
      return { path: "/" };
    },
  },
];

// Creazione del Router
export const createRouter = (app) => {
  const router = createVueRouter({
    history: createWebHistory(),
    routes,
  });

  // Aggiungi il middleware alla funzione di passaggio di middleware del router
  function nextFactory(context, middleware, index) {
    const nextMiddleware = middleware[index];

    if (!nextMiddleware) {
      return context.next;
    }
    const subsequentMiddleware = nextFactory(context, middleware, index + 1);
    return nextMiddleware({ ...context, next: subsequentMiddleware });
  }
  // Middleware per la gestione dell'Autenticazione
  router.beforeEach((to, from, next) => {
    if (!to.meta.middleware) {
      return next();
    }

    const middleware = Array.isArray(to.meta.middleware)
      ? to.meta.middleware
      : [to.meta.middleware];
    const context = {
      to,
      from,
      next,
      router,
    };

    return middleware[0]({
      ...context,
      next: nextFactory(context, middleware, 1),
    });
  });

  return router;
};

export default createRouter;
