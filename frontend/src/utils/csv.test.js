import test from "node:test";
import assert from "node:assert/strict";
import { generaCsv } from "./csv.js";

const base = {
  data: "2026-08-05", importo: 12.5, descrizione: "Pizza", categoria: "Cibo",
  budgetCategoria: 200, portafoglio: "Casa", ricorrente: false, contanti: true,
};

test("riga base e intestazione", () => {
  const [intest, riga] = generaCsv([base]).split("\n");
  assert.equal(intest, "data,importo,descrizione,categoria,budget_categoria,portafoglio,ricorrente,contanti");
  assert.equal(riga, '2026-08-05,12.50,"Pizza","Cibo",200.00,"Casa",no,si');
});

test("escaping: virgole, virgolette e a capo non rompono le colonne", () => {
  const csv = generaCsv([{ ...base, descrizione: 'Ciao, "mondo"\nsecondo', categoria: "A,B" }]);
  assert.equal(csv.split("\n")[1], '2026-08-05,12.50,"Ciao, ""mondo"" secondo","A,B",200.00,"Casa",no,si');
});

test("lista vuota: solo l'intestazione", () => {
  assert.equal(generaCsv([]).split("\n").length, 2); // intestazione + riga vuota finale
});
