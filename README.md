# budget

Gestione del budget su più portafogli: **frontend** Vue 3 (`frontend/`) e
**backend** Strapi 5 (`backend/`) nello stesso repository, così una modifica
che tocca entrambi è un commit e un deploy solo.

```
budget/
├── frontend/          Vue 3 + PrimeVue, servito da nginx (che inoltra /api al backend)
├── backend/           Strapi 5 + MySQL esterno
├── docker-compose.yml i due servizi
└── Jenkinsfile        build + deploy
```

## Sviluppo

```sh
cd backend  && cp .env.example .env && npm install && npm run develop   # :1337
cd frontend && npm install && npm run dev                               # :5173, /api → :1337
```

Il frontend chiama `/api` sullo stesso indirizzo: in sviluppo inoltra il proxy
di Vite, in produzione nginx. Niente CORS e nessun indirizzo dentro il bundle.

Test: `npm test` in `frontend/`; nel backend `for t in tests/*.test.js; do node $t; done`.

## Produzione

```sh
cp .env.example .env            # e compila: vedi i commenti nel file
docker compose up -d --build --wait
```

- `frontend` (porta `BUDGET_FRONTEND_PORT`, default 8017): l'app. Dall'esterno
  passa solo `/api/`; il pannello admin non è raggiungibile da qui.
- `backend` (porta `BUDGET_ADMIN_PORT`, default 1337): serve solo per il pannello
  admin, da cui si creano gli utenti. Limitala al tuo IP nel reverse proxy.
- MySQL è esterno, sulla rete `BUDGET_DB_NETWORK` (default `lavoro-net`).

Pulizia una tantum degli orfani: `docker exec budget-api node scripts/pulisci-orfani.js`
(anteprima; `--elimina` per cancellare, dopo un backup).

## Notifiche push

In **Impostazioni → Notifiche** puoi impostare l'orario italiano e ricevere i
promemoria il giorno prima o il giorno stesso della scadenza di una transazione
ricorrente. Gli avvisi di sforamento sono facoltativi e arrivano una volta per
categoria e mese su ciascun dispositivo attivo. I portafogli esclusi dalle
statistiche ricevono i promemoria di scadenza. Toccando un avviso si aprono i
dettagli nell'app dopo l'accesso.

L'orario delle notifiche locali di Budget Flutter resta utilizzabile da Android.
Sul web, se è già presente, viene proposto al primo accesso alle preferenze.

Per abilitarle sul server, genera una coppia VAPID dedicata a Budget App.
Dalla cartella `backend/`, con le dipendenze installate:

```sh
(
  umask 077
  budget_vapid_file=$(mktemp "$HOME/budget-vapid.XXXXXX") || exit
  node -e '
    const k = require("web-push").generateVAPIDKeys();
    console.log("BUDGET_WEB_PUSH_PUBLIC_KEY=" + k.publicKey);
    console.log("BUDGET_WEB_PUSH_PRIVATE_KEY=" + k.privateKey);
    console.log("BUDGET_WEB_PUSH_SUBJECT=mailto:contatto@example.invalid");
  ' > "$budget_vapid_file" && printf '%s\n' "$budget_vapid_file"
)
```

Sostituisci l'indirizzo di esempio con un contatto reale del gestore. Aggiungi le
tre righe al file di produzione completo e aggiorna il **Secret file** Jenkins
`budget-api-env` con quel file. Riutilizza le stesse chiavi ai rilasci successivi
e conserva la privata fuori da Git. Fai il backup di MySQL prima del rilascio.
Strapi aggiunge le preferenze utente e le tabelle per dispositivi e consegne al
riavvio. Il container deve poter raggiungere
via HTTPS i servizi push dei browser e l'app va servita in HTTPS.

Dopo il rilascio, apri **Impostazioni → Notifiche**, premi **Attiva le notifiche**
su ciascun dispositivo e usa **Invia notifica di prova**. Per verificare la
consegna in background, imposta una scadenza di prova per oggi, salva un orario
tra qualche minuto e chiudi l'app. Su iOS apri Budget App dalla schermata Home
prima di attivare. Il permesso del browser, la connessione e le impostazioni del
dispositivo determinano la consegna. Il contatto VAPID identifica il gestore
presso il servizio push.

Il test con Strapi e MySQL si esegue su un database di prova isolato:

```sh
docker run --rm -d --name budget-push-test -p 127.0.0.1::3306 \
  -e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_DATABASE=budget_push_test \
  -e MYSQL_USER=budget_test -e MYSQL_PASSWORD=temporary_budget_test mysql:8.4
# Usa la porta indicata da docker port budget-push-test, dopo l'avvio di MySQL.
BUDGET_NOTIFICHE_TEST_MYSQL_PORT=PORTA node --test backend/tests/notifiche.test.js
docker stop budget-push-test
```

Storia: unione di `budget-app` e `budget-api` (git subtree, storia conservata).
