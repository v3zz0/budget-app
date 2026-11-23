import { ref } from "vue";

// Modalità Giorno / Notte / Sistema (progetto.md §14). La preferenza resta sul
// dispositivo (localStorage "budget.tema") e vale per tutte le schede; il
// profilo la salva anche sull'utente (campo `tema`) e al login la riapplica.
// Lo script in index.html fa la stessa cosa prima del primo disegno.
const CHIAVE = "budget.tema";
const sistemaChiaro = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;

export const preferenzaTema = ref(leggi());
export const temaChiaro = ref(false);

function leggi() {
  try {
    return localStorage.getItem(CHIAVE) || "sistema";
  } catch {
    return "sistema";
  }
}

function applica() {
  const t = preferenzaTema.value;
  temaChiaro.value = t === "giorno" || (t === "sistema" && !!sistemaChiaro?.matches);
  document.documentElement.dataset.theme = temaChiaro.value ? "light" : "dark";
}

/** t = "sistema" | "giorno" | "notte" */
export function impostaTema(t) {
  if (!["sistema", "giorno", "notte"].includes(t)) return;
  preferenzaTema.value = t;
  try {
    localStorage.setItem(CHIAVE, t);
  } catch {
    /* spazio pieno o modalità privata: vale per questa scheda */
  }
  applica();
}

export function avviaTema() {
  applica();
  sistemaChiaro?.addEventListener("change", applica);
  // Se il dispositivo ha cambiato tema mentre l'app era in background
  document.addEventListener("visibilitychange", () => !document.hidden && applica());
  // Un'altra scheda ha cambiato preferenza
  addEventListener("storage", (e) => {
    if (e.key === CHIAVE) {
      preferenzaTema.value = leggi();
      applica();
    }
  });
}
