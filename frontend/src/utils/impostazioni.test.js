import test from "node:test";
import assert from "node:assert/strict";
import {
  campiAi, chiaveImpostata, errorePassword, erroreProfilo, ordinaModelli, urlPerMotore,
} from "./impostazioni.js";
import { categoriaOmonima, dataRicorrenza, forzaPassword, nomeCategoria } from "./impostazioni.js";

test("urlPerMotore: preset solo se vuoto o di un altro motore, mai sopra un indirizzo scritto a mano", () => {
  assert.equal(urlPerMotore("openrouter", ""), "https://openrouter.ai/api/v1");
  assert.equal(urlPerMotore("openrouter", "http://10.0.0.5:11434"), "https://openrouter.ai/api/v1");
  assert.equal(urlPerMotore("openrouter", "https://mio-proxy.it/v1"), "https://mio-proxy.it/v1");
  assert.equal(urlPerMotore("llamacpp", ""), "http://localhost:8080");
  assert.equal(urlPerMotore("llamacpp", "https://openrouter.ai/api/v1"), "http://localhost:8080");
  assert.equal(urlPerMotore("llamacpp", "http://192.168.1.9:9000"), "http://192.168.1.9:9000");
  assert.equal(urlPerMotore("ollama", "https://openrouter.ai/api/v1"), "");
  assert.equal(urlPerMotore("ollama", "http://localhost:8080"), "");
  assert.equal(urlPerMotore("ollama", "http://192.168.1.10:11434"), "http://192.168.1.10:11434");
});

test("ordinaModelli: gratuiti in cima, poi alfabetico, senza toccare l'originale", () => {
  const origine = ["b/modello", "z/x:free", "a/modello", "c/y:free"];
  assert.deepEqual(ordinaModelli(origine), ["c/y:free", "z/x:free", "a/modello", "b/modello"]);
  assert.equal(origine[0], "b/modello");
});

test("campiAi: la chiave va nel campo del motore, e solo se riscritta", () => {
  const base = { url: "u", modello: "m" };
  assert.deepEqual(campiAi({ motore: "ollama", ...base }, ""), { aiMotore: "ollama", aiUrl: "u", aiModello: "m" });
  assert.deepEqual(campiAi({ motore: "openrouter", ...base }, "sk-1"), {
    aiMotore: "openrouter", aiUrl: "u", aiModello: "m", aiChiave: "sk-1", aiChiaveImpostata: true,
  });
  assert.deepEqual(campiAi({ motore: "llamacpp", ...base }, "k2"), {
    aiMotore: "llamacpp", aiUrl: "u", aiModello: "m", aiChiaveLlamacpp: "k2", aiChiaveLlamacppImpostata: true,
  });
  // chiave vuota: nessun campo chiave nel body, quella salvata resta com'è
  assert.equal("aiChiave" in campiAi({ motore: "openrouter", ...base }, ""), false);
});

test("chiaveImpostata legge il flag del motore giusto", () => {
  const u = { aiChiaveImpostata: true, aiChiaveLlamacppImpostata: false };
  assert.equal(chiaveImpostata(u, "openrouter"), true);
  assert.equal(chiaveImpostata(u, "llamacpp"), false);
  assert.equal(chiaveImpostata({}, "ollama"), false);
});

test("validazione profilo e password", () => {
  assert.equal(erroreProfilo({ nome: "ab", email: "a@b.it" }), "Il nome utente deve avere almeno 3 caratteri");
  assert.equal(erroreProfilo({ nome: "  abc ", email: "non-una-email" }), "Indirizzo email non valido");
  assert.equal(erroreProfilo({ nome: "vezzo", email: " v@x.it " }), null);
  assert.equal(errorePassword("", "abcdef"), "Compila entrambi i campi password");
  assert.equal(errorePassword("vecchia1", "abc"), "La nuova password deve avere almeno 6 caratteri");
  assert.equal(errorePassword("stessa12", "stessa12"), "La nuova password è uguale a quella attuale");
  assert.equal(errorePassword("vecchia1", "nuova123"), null);
});

test("forza password su tre livelli", () => {
  assert.equal(forzaPassword(""), 0);
  assert.equal(forzaPassword("abc"), 1);
  assert.equal(forzaPassword("abcdefgh"), 1);
  assert.equal(forzaPassword("abcdefgh1"), 2);
  assert.equal(forzaPassword("Abcdefgh12!x"), 3);
});

test("nomi delle categorie: maiuscola e doppioni", () => {
  assert.equal(nomeCategoria("  spesa   grande "), "Spesa grande");
  const cat = [{ documentId: "a", Nome: "Stipendio" }, { documentId: "b", Nome: "Spesa" }];
  assert.equal(categoriaOmonima("stipendio", cat).documentId, "a");
  assert.equal(categoriaOmonima("stipendio", cat, "a"), null, "sé stessa non conta");
  assert.equal(categoriaOmonima("Benzina", cat), null);
});

test("giorno della ricorrenza: 31 non diventa 1", () => {
  assert.equal(dataRicorrenza(31), "2000-01-31");
  assert.equal(dataRicorrenza(5), "2000-01-05");
  assert.equal(dataRicorrenza(0), "2000-01-01");
});
