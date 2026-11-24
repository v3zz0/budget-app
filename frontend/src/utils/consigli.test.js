import test from "node:test";
import assert from "node:assert/strict";
import { descrivi, differenza, inAttesa, scala } from "./consigli.js";

const mesi = [400, 520, 460, 480, 510, 490].map((speso, i) => ({ mese: `2026-0${5 + i}`.replace("010", "10").replace("011", "11"), speso }));
const alza = { tipo: "alza", budgetAttuale: 400, budgetProposto: 480, mesiAnalizzati: mesi, categorie: { Nome: "Spesa" } };

test("frase e bottone dal consiglio", () => {
  const d = descrivi(alza);
  assert.equal(d.h, "Spesa: sfori 5 mesi su 6");
  assert.equal(d.ok, "Porta a €480");
  assert.match(descrivi({ ...alza, tipo: "abbassa", budgetAttuale: 600, budgetProposto: 500 }).p, /liberi €100 al mese/);
});

test("mini grafico: barre e linee sulla stessa scala", () => {
  const s = scala(alza);
  assert.equal(s.barre.filter((b) => b.sopra).length, 5);
  assert.ok(s.barre.every((b) => b.h > 0 && b.h < 100));
  assert.ok(s.proposto > s.attuale);
});

test("accettandoli tutti e categorie in attesa di storico", () => {
  assert.equal(differenza([alza, { budgetAttuale: 100, budgetProposto: 70 }]), 50);
  const cat = [{ documentId: "a", Nome: "Bar" }, { documentId: "b", Nome: "Regali" }, { documentId: "s", Nome: "Stip", Tipo: "entrata" }];
  const righe = [
    { data: "2026-09-02", categoriaId: "a" }, { data: "2026-10-02", categoriaId: "a" },
    { data: "2026-11-02", categoriaId: "b" }, // mese in corso: non conta
    { data: "2026-10-02", categoriaId: "s" },
  ];
  assert.deepEqual(inAttesa(cat, righe, ["2026-09", "2026-10"]).map((c) => [c.Nome, c.mancano]), [["Bar", 1]]);
});
