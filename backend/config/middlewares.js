module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'global::pulisci-upload', // dopo body: cancella i file caricati anche se la richiesta è respinta
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
