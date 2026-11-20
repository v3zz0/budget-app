'use strict';

// Restringe gli endpoint /api/users/* al solo utente che chiama e chiude
// registrazione e recupero password (vedi in fondo). Utenti: update, find,
// findOne, count, create, destroy. L'app modifica il profilo con `PUT /api/users/:id` (nome, email, orario delle
// notifiche, impostazioni AI), e per farlo il permesso `update` dev'essere
// acceso sul ruolo Authenticated.
//
// Il problema è che quel permesso, così com'è in users-permissions, NON è
// legato al proprietario: un qualunque utente autenticato può passare l'id di
// un altro e riscrivergli email e password. Con un utente solo è teorico, ma
// questo repository è pubblico e chiunque lo self-hosti in due si porta dietro
// il buco senza saperlo.
//
// Stessa filosofia dei controller di wallet/categorie/transazioni: il filtro sta
// sul server, non nel client.
module.exports = (plugin) => {
  const updateOriginale = plugin.controllers.user.update;

  plugin.controllers.user.update = async (ctx) => {
    const utente = ctx.state.user;
    if (!utente) return ctx.unauthorized();

    // `id` può arrivare come stringa dalla rotta: confronto lasco voluto.
    if (String(ctx.params.id) !== String(utente.id)) {
      return ctx.forbidden('Puoi modificare solo il tuo profilo');
    }

    // Ruolo, blocco e conferma non si toccano dall'app: sono la serratura, e
    // non ha senso lasciarne la chiave dentro. Restano modificabili solo dal
    // pannello di amministrazione.
    for (const campo of ['role', 'blocked', 'confirmed', 'provider']) {
      delete ctx.request.body[campo];
    }

    return updateOriginale(ctx);
  };

  // Lettura: ognuno vede solo sé stesso.
  //
  // `find` serve all'app anche se non la chiama mai: i controller owner-aware
  // filtrano per `users_permissions_user`, e Strapi 5 valida i filtri sulle
  // relazioni contro i permessi del ruolo. Senza `user.find` abilitato,
  // /api/wallets risponde `Invalid key users_permissions_user`. Ma abilitato
  // di suo elenca TUTTI gli utenti (nome ed email) a chiunque sia autenticato:
  // con più utenti è una fuga di dati. Quindi il permesso resta acceso e il
  // controller restituisce solo l'utente stesso, riusando `me`.
  const me = plugin.controllers.user.me;

  plugin.controllers.user.find = async (ctx) => {
    await me(ctx);
    if (ctx.body) ctx.body = [ctx.body]; // stessa forma di prima: un array
  };

  plugin.controllers.user.findOne = async (ctx) => {
    if (!ctx.state.user) return ctx.unauthorized();
    // Un id altrui risponde come se non esistesse: non si conferma che c'è.
    if (String(ctx.params.id) !== String(ctx.state.user.id)) return ctx.notFound();
    return me(ctx);
  };

  // Rivelerebbe quanti utenti ci sono.
  plugin.controllers.user.count = async (ctx) => {
    if (!ctx.state.user) return ctx.unauthorized();
    ctx.body = 1;
  };

  // Scrittura: l'app non crea né cancella utenti da qui (la registrazione passa
  // da /auth/local/register). Se qualcuno abilitasse questi permessi nel ruolo,
  // `destroy` cancellerebbe QUALUNQUE utente e `create` ne creerebbe con
  // qualunque ruolo. Account e ruoli si gestiscono dal pannello admin.
  const nonConsentito = (ctx) => ctx.forbidden('Operazione non consentita');
  plugin.controllers.user.create = nonConsentito;
  plugin.controllers.user.destroy = nonConsentito;

  // Accesso: gli account li crea e li gestisce SOLO l'amministratore, dal pannello
  // Strapi (Content Manager → User, con "confirmed" acceso e ruolo Authenticated).
  // La registrazione di Strapi è un'impostazione nel database (Advanced settings →
  // "Enable sign-ups"), aperta di default: qui si chiude nel codice, così non
  // dipende da come è configurata un'installazione. Stesso discorso per il
  // recupero password e la conferma email: l'amministratore reimposta la password
  // dal pannello, e questi endpoint senza un provider email non servirebbero a
  // niente (anzi, rivelerebbero quali email esistono). `change-password` resta:
  // l'utente cambia la propria dalla pagina Profilo, con quella attuale.
  //
  // Attenzione: `auth` è una FACTORY (`({ strapi }) => ({...})`), a differenza di
  // `user` che è un oggetto: assegnare proprietà alla funzione non cambia il
  // controller vero (e la registrazione resterebbe aperta senza dare errori).
  const chiuso = (messaggio) => (ctx) => ctx.forbidden(messaggio);
  const messaggioPassword = 'Funzione non disponibile: la password la reimposta l\'amministratore';
  const authOriginale = plugin.controllers.auth;
  plugin.controllers.auth = (args) => ({
    ...(typeof authOriginale === 'function' ? authOriginale(args) : authOriginale),
    register: chiuso('Registrazione chiusa: gli account li crea l\'amministratore'),
    forgotPassword: chiuso(messaggioPassword),
    resetPassword: chiuso(messaggioPassword),
    emailConfirmation: chiuso(messaggioPassword),
    sendEmailConfirmation: chiuso(messaggioPassword),
  });

  return plugin;
};
