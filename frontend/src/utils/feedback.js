// "Allega pagina e dispositivo" del feedback (progetto.md §20). Logica pura.

export const TIPI_FEEDBACK = {
  problema: { label: "Qualcosa non va", icona: "ph-bug", ph: "Cosa stavi facendo e cosa è successo? Es. «Salvo un'uscita e non compare nell'elenco»" },
  idea: { label: "Un'idea", icona: "ph-lightbulb", ph: "Cosa ti piacerebbe poter fare? Es. «Vorrei vedere le spese per settimana»" },
  altro: { label: "Altro", icona: "ph-chat-circle", ph: "Scrivi quello che vuoi dirci" },
};

const PAGINE = {
  home: "Home", transazioni: "Transazioni", risparmio: "Salvadanaio", analisi: "Analisi",
  impostazioni: "Impostazioni", anno: "Anno", consigli: "Consigli",
};

/** "Transazioni · Chrome su Android · 375×812 · tema notte" */
export function contestoPagina({ pagina, ua = "", larghezza, altezza, chiaro }) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : "Linux";
  return `${PAGINE[pagina] || "App"} · ${browser} su ${os} · ${larghezza}×${altezza} · tema ${chiaro ? "giorno" : "notte"}`;
}
