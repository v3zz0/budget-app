import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

// Preset PrimeVue. Niente hex: i colori stanno in assets/main.css (@theme) e
// qui si leggono come variabili CSS. Giorno e Notte NON passano da
// colorScheme di PrimeVue: sono le variabili stesse a cambiare con
// <html data-theme>. Si usa SEMPRE lo schema "dark" di Aura (dove 0 = testo e
// 950 = fondo, come la nostra scala): main.js lo attiva con "html:root", più
// specifico del :root dello schema chiaro.
const scala = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const primario = {
  color: "var(--color-crema)",
  contrastColor: "var(--color-inchiostro)",
  hoverColor: "var(--color-crema-scuro)",
  activeColor: "var(--color-crema-scuro)",
};

const schema = {
  surface: Object.fromEntries(scala.map((n) => [n, `var(--color-surface-${n})`])),
  primary: primario,
  highlight: {
    background: "var(--color-campo)",
    focusBackground: "var(--color-campo)",
    color: "var(--color-testo)",
    focusColor: "var(--color-testo)",
  },
  formField: {
    background: "var(--color-campo)",
    borderColor: "transparent",
    hoverBorderColor: "var(--color-bordo-forte)",
    focusBorderColor: "var(--color-anello)",
    color: "var(--color-testo)",
  },
  content: { borderColor: "var(--color-bordo)", background: "var(--color-card)" },
  overlay: {
    select: { background: "var(--color-fondo-profondo)", borderColor: "transparent" },
    popover: { background: "var(--color-fondo-profondo)", borderColor: "transparent" },
    modal: { background: "var(--color-card)", borderColor: "transparent" },
  },
};

export const budgetTheme = definePreset(Aura, {
  semantic: {
    primary: primario,
    focusRing: { color: "var(--color-anello)" },
    formField: { borderRadius: "16px" },
    colorScheme: { dark: schema },
  },
});
