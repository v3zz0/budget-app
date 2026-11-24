import test from "node:test";
import assert from "node:assert/strict";
import { EMOJI_CATEGORIE, aggiungiRecente, griglia, primaEmoji } from "./emoji.js";

test("44 emoji, senza doppioni", () => {
  assert.equal(EMOJI_CATEGORIE.length, 44);
  assert.equal(new Set(EMOJI_CATEGORIE).size, 44);
});

test("primaEmoji: anche composte, niente lettere o numeri", () => {
  assert.equal(primaEmoji("🦄"), "🦄");
  assert.equal(primaEmoji("ciao 🍕 e 🍔"), "🍕");
  assert.equal(primaEmoji("👨‍👩‍👧"), "👨‍👩‍👧");
  assert.equal(primaEmoji("🇮🇹"), "🇮🇹");
  assert.equal(primaEmoji("abc"), null);
  assert.equal(primaEmoji("123"), null);
});

test("griglia: l'emoji fuori lista e le recenti in testa", () => {
  assert.deepEqual(griglia("🦄", ["🐙", "🦄"]).slice(0, 3), ["🦄", "🐙", "🏷️"]);
  assert.equal(griglia("🛒").length, 44, "un'emoji della lista non si duplica");
  assert.deepEqual(aggiungiRecente(["a", "b"], "b"), ["b", "a"]);
  assert.equal(aggiungiRecente(Array.from({ length: 8 }, (_, i) => String(i)), "x").length, 8);
});
