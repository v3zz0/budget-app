'use strict';

// Solo l'invio: il feedback si legge dall'admin, non dall'app.
module.exports = {
  routes: [{ method: 'POST', path: '/feedback', handler: 'feedback.invia', config: { policies: [] } }],
};
