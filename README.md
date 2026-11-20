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

Storia: unione di `budget-app` e `budget-api` (git subtree, storia conservata).
