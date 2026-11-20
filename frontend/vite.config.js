import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  // In sviluppo /api va al backend locale, come in produzione fa nginx
  // (frontend/nginx/default.conf). Altro indirizzo: VITE_PROXY_API=http://...
  server: {
    proxy: { "/api": process.env.VITE_PROXY_API || "http://localhost:1337" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
