import test from "node:test";
import assert from "node:assert/strict";
import { categoriaSuggerita, raggruppaCategorie } from "./analisi.js";

const cats = [
  { documentId: "1", nome: "Cibo", wallet: "Personale" },
  { documentId: "2", nome: "Mutuo", wallet: "Casa" },
  { documentId: "3", nome: "Bollette", wallet: "Casa" },
  { documentId: "4", nome: "Senza", wallet: "" },
];

test("raggruppa per portafoglio, ordinando gruppi e categorie", () => {
  const g = raggruppaCategorie(cats);
  assert.deepEqual(g.map((x) => x.wallet), ["Altro", "Casa", "Personale"]);
  assert.deepEqual(g[1].items.map((i) => i.label), ["Bollette", "Mutuo"]);
  assert.equal(g[1].items[0].value, "3");
});

test("suggerimento: stesso nome senza badare alle maiuscole, altrimenti null", () => {
  assert.equal(categoriaSuggerita(cats, "mutuo"), "2");
  assert.equal(categoriaSuggerita(cats, "Inventata"), null);
  assert.equal(categoriaSuggerita(cats, undefined), null);
  assert.equal(categoriaSuggerita(cats, ""), null);
});
