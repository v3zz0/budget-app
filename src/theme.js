import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

// Preset PrimeVue dark. Niente hex: i colori stanno in assets/main.css
// (@theme) e qui si leggono come variabili CSS.
const scala = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export const budgetTheme = definePreset(Aura, {
  semantic: {
    primary: {
      color: "var(--color-accent)",
      inverseColor: "#ffffff",
      hoverColor: "var(--color-accent)",
      activeColor: "var(--color-accent)",
    },
    colorScheme: {
      dark: {
        surface: Object.fromEntries(
          scala.map((n) => [n, `var(--color-surface-${n})`]),
        ),
        primary: {
          color: "var(--color-accent)",
          inverseColor: "#ffffff",
          hoverColor: "var(--color-accent)",
          activeColor: "var(--color-accent)",
        },
        highlight: {
          background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
          focusBackground: "color-mix(in srgb, var(--color-accent) 28%, transparent)",
          color: "var(--color-testo)",
          focusColor: "var(--color-testo)",
        },
        // Aura mette i campi a surface.950 (= sfondo): qui sono più chiari
        // della card, come nell'app Flutter.
        formField: { background: "var(--color-campo)" },
        content: { borderColor: "var(--color-bordo)" },
      },
    },
  },
});
