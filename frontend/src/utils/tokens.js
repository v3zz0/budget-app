// Legge un colore dal tema (main.css) per chi non può usare classi o var():
// Chart.js disegna su canvas, e il canvas non risolve le variabili CSS.
export const token = (nome) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--color-${nome}`).trim();
