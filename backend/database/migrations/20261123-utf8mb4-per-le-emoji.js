'use strict';

// Emoji nel database (salvadanai, categorie, nomi visualizzati...).
//
// MySQL crea le tabelle nuove col set di caratteri predefinito del database.
// Se è `utf8` (= utf8mb3, 3 byte) le emoji, che ne vogliono 4, fanno fallire
// l'INSERT con "Incorrect string value: '\xF0\x9F...'" (500 alla creazione di
// un salvadanaio con 🚲). Qui:
//   1. il predefinito del database diventa utf8mb4, così anche le tabelle che
//      Strapi creerà in futuro nascono giuste;
//   2. ogni tabella ancora in utf8/utf8mb3 viene convertita (CONVERT TO
//      cambia anche le colonne di testo esistenti, senza perdere dati: utf8mb3
//      è un sottoinsieme di utf8mb4).
// Su SQLite e Postgres non fa niente. Idempotente: le tabelle già utf8mb4 si
// saltano.

module.exports = {
  async up(knex) {
    const client = knex.client.config.client;
    if (!['mysql', 'mysql2'].includes(client)) return;

    const [[{ db }]] = await knex.raw('SELECT DATABASE() AS db');
    await knex.raw('ALTER DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [db]);

    const [tabelle] = await knex.raw(
      `SELECT TABLE_NAME AS nome FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       AND TABLE_COLLATION NOT LIKE 'utf8mb4%'`,
      [db],
    );
    for (const { nome } of tabelle) {
      await knex.raw('ALTER TABLE ?? CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [nome]);
    }
  },

  async down() {
    // Tornare a utf8mb3 perderebbe le emoji già salvate: non si torna indietro.
  },
};
