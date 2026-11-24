import { api } from "./api.js";

/** Invia un feedback. screenshot: File facoltativo (va nella Media Library). */
export async function inviaFeedback({ tipo, messaggio, contesto, rispondi, screenshot }) {
  const form = new FormData();
  form.append("tipo", tipo);
  form.append("messaggio", messaggio);
  if (contesto) form.append("contesto", contesto);
  form.append("rispondi", rispondi ? "true" : "false");
  if (screenshot) form.append("screenshot", screenshot, screenshot.name || "screenshot.png");
  await api.post("/api/feedback", form, { timeout: 60000 });
}
