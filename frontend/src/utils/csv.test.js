import test from "node:test";
import assert from "node:assert/strict";
import { generaCsv } from "./csv.js";

const base = {
  data: "2026-08-05", tipo: "uscita", importo: 1850, descrizione: "Pizza", categoria: "Cibo",
  budgetCategoria: 200, portafoglio: "Casa", ricorrente: false, contanti: true,
};
const righe = (csv) => csv.replace(/^\uFEFF/, "").split("\r\n");

test("BOM, intestazione e importi all'italiana", () => {
  const csv = generaCsv([base]);
  assert.ok(csv.startsWith("\uFEFF"), "BOM UTF-8 per Excel");
  const [intest, riga] = righe(csv);
  assert.equal(intest, "data;tipo;importo;descrizione;categoria;budget_categoria;portafoglio;ricorrente;contanti");
  assert.equal(riga, '2026-08-05;uscita;1.850,00;"Pizza";"Cibo";200,00;"Casa";no;si');
});

test("escaping: punto e virgola, virgolette e a capo non rompono le colonne", () => {
  const csv = generaCsv([{ ...base, tipo: "entrata", descrizione: 'Ciao; "mondo"\nsecondo', categoria: "A;B" }]);
  assert.equal(righe(csv)[1], '2026-08-05;entrata;1.850,00;"Ciao; ""mondo"" secondo";"A;B";200,00;"Casa";no;si');
});

test("lista vuota: solo l'intestazione", () => {
  assert.equal(righe(generaCsv([])).length, 2); // intestazione + riga vuota finale
});
