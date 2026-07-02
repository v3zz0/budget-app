// auth middleware
import { useAuthStore } from "@/stores/auth";

export default async function auth({ next }) {
  const authStore = useAuthStore();

  const isLoggedIn = authStore.isLoggedIn;
  if (!isLoggedIn) {
    console.log("Not logged in");
    return next({
      name: "Login",
    });
  }
  return next();
}

/**
 * Esempio di utilizzo nel router:
 * {
 *   path: '/protected',
 *   name: 'ProtectedRoute',
 *   component: ProtectedComponent,
 *   meta: {
 *     middleware: [auth]
 *   }
 * }
 */
