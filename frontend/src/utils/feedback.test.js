import test from "node:test";
import assert from "node:assert/strict";
import { contestoPagina } from "./feedback.js";

test("contesto del feedback", () => {
  const android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
  assert.equal(contestoPagina({ pagina: "transazioni", ua: android, larghezza: 375, altezza: 812, chiaro: false }), "Transazioni · Chrome su Android · 375×812 · tema notte");
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  assert.equal(contestoPagina({ pagina: "home", ua: iphone, larghezza: 390, altezza: 844, chiaro: true }), "Home · Safari su iOS · 390×844 · tema giorno");
});
