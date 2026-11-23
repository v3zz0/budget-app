import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { cpSync, createReadStream, existsSync } from "node:fs";
import { join } from "node:path";

// Emoji Apple servite in locale (niente CDN): solo le PNG 64px del pacchetto
// emoji-datasource-apple (27 MB), non i fogli sprite. In sviluppo le legge da
// node_modules, in build le copia in dist/emoji.
const EMOJI = fileURLToPath(new URL("./node_modules/emoji-datasource-apple/img/apple/64", import.meta.url));
const emojiLocali = {
  name: "emoji-locali",
  configureServer(server) {
    server.middlewares.use("/emoji", (req, res, next) => {
      const nome = req.url.split("?")[0].slice(1);
      if (!/^[0-9a-f-]+\.png$/.test(nome) || !existsSync(join(EMOJI, nome))) return next();
      const file = join(EMOJI, nome);
      res.setHeader("Content-Type", "image/png");
      createReadStream(file).pipe(res);
    });
  },
  writeBundle(opts) {
    cpSync(EMOJI, join(opts.dir, "emoji"), { recursive: true });
  },
};

export default defineConfig({
  plugins: [vue(), emojiLocali],
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
