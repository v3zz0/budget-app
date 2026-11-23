// Persone dal punto di vista di chi guarda. Logica pura (niente Vue).

/** Colori ammessi per l'avatar (token --color-av-*). Il lilla è dell'altra persona. */
export const COLORI_AVATAR = ["nebbia", "argilla", "kaki", "pietra", "rosa"];

/** Utente Strapi -> { id, nome, foto, colore }. */
export const persona = (u, colore) =>
  u
    ? {
        id: u.id,
        nome: (u.nomeVisualizzato || u.username || "").trim() || "?",
        foto: u.avatar || null,
        colore: colore || (COLORI_AVATAR.includes(u.coloreAvatar) ? u.coloreAvatar : "nebbia"),
      }
    : null;
