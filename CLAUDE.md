# CLAUDE.md

Guida per Claude Code (claude.ai/code) quando lavora in questo repository.

## Lingua

Comunicare sempre in **italiano** con lo sviluppatore (Vezzo). Codice, commenti e
messaggi di commit in italiano.

## Panoramica progetto

Web app per la gestione del budget su più portafogli, con backend Strapi
self-hosted. Nata mono-utente (Vezzo), **l'obiettivo ora è il multi-utente**.
Repository pubblici su GitHub.

**Cambio di rotta (2026-11-19):** la web app Vue è il frontend attivo e riceve
tutto lo sviluppo. `budget-flutter/` è abbandonato: non si tocca e non si
propone lavoro lì. Resta solo come **specifica funzionale** di cosa portare in
Vue (le sezioni "App Flutter" qui sotto servono a questo).

Stato del porting Flutter → Vue (fasi):
1. ✅ Fondamenta: tema dark, `services/`, store, shell, dashboard con filtro
   mese lato server, form transazione (nuova/modifica)
2. ✅ Salvadanaio editabile (`risparmio.vue`), schermata Ricorrenti
3. Funzioni avanzate, a passi:
   - ✅ 3a: consigli (`/consigli`, campanella in home), riepilogo anno (`/anno`),
     export CSV con ambito (`/export`)
   - ✅ 3b: analisi estratto conto (`/analisi`, upload multi-file, registrazione
     dei mancanti con scelta categoria tra TUTTI i portafogli)
   - ✅ 3c: OCR scontrino **lato server** (`tesseract.js` in Strapi, non
     on-device; pulsante "Scansiona scontrino" nel form nuova transazione)
4. ✅ Impostazioni (`views/impostazioni/*`): profilo, portafogli (con esclusione
   dalle statistiche), categorie, Analisi AI (3 motori). Ricorrenti ed Export ne
   sono sottopagine (link "indietro"). **Non portati, solo da telefono:**
   notifiche locali, soglia di avviso, sblocco biometrico, widget, coda offline.
   Provato nel browser contro un backend vero (login, tutte le schermate e i
   flussi di scrittura); **non** ancora su dati di produzione.
5. ✅ Multi-utente (decisioni di Vezzo, 2026-11-20): **gli account li crea
   solo lui dal pannello Strapi**, niente registrazione né recupero password
   via email (la password la reimposta lui dall'admin). Fatto:
   - sicurezza lato backend (verificata da `tests/sicurezza-e2e.test.js`):
     `/api/users/*` ristretto al solo utente stesso; registrazione, recupero
     password e conferma email **chiusi nel codice** (403, indipendenti dal flag
     nel DB); cancellazione a cascata (utente → wallet → categorie →
     transazioni, salvadanaio; categoria → transazioni, consigli) in
     transazione, anche da admin; chiavi AI **cifrate** nel database; controllo
     SSRF sull'indirizzo AI (`AI_URL_PRIVATI`); permessi del ruolo Authenticated
     seedati in bootstrap
   - primo avvio guidato nella home: un utente appena creato (senza dati)
     crea il primo portafoglio e viene portato alle categorie
   - **Nuovo utente:** Admin → Content Manager → User → Create new entry:
     username, email, password, `confirmed` acceso, ruolo `Authenticated`.
     Per reimpostare una password: stessa schermata, campo password.
   - **Eliminare un utente dall'admin ne elimina anche tutti i dati** (non si
     recupera).
   - **Pulizia orfani una tantum** (record lasciati dalle eliminazioni fatte
     PRIMA della cascata): `scripts/pulisci-orfani.js`, vedi "Cascata, permessi,
     SSRF". Da lanciare una volta sul database vero
   - **Ancora aperto:** cambiare o perdere `AI_KEYS_SECRET` rende illeggibili le
     chiavi AI salvate (gli utenti le reinseriscono)
6. ✅ Redesign "demoThomas" (2026-11-23, branch `redesign-demothomas`): grafica
   nuova (antracite calda, blocchi pieni, Giorno/Notte/Sistema), entrate,
   Impostazioni in una pagina, Transazioni con form ed elenco, Home dashboard,
   salvadanaio a cartelle, Analisi con mancanti/solo app/importo diverso,
   **portafoglio condiviso** con una seconda persona. Specifica e mockup in
   `budgetApp/demoThomas/` (`progetto.md` fa fede). Provato nel browser su
   SQLite con due utenti; **non** ancora su dati di produzione.

## Struttura repository

**Monorepo** (dal 2026-11-20, come `pulse-app`): il repository `budget-app`
(GitHub `v3zz0/budget-app`) contiene frontend e backend. Una modifica che li
tocca entrambi è un commit e un deploy solo.

```
budget-app/                  # repository git
├── frontend/                # Vue 3, servito da nginx che inoltra /api al backend
├── backend/                 # Strapi 5 + MySQL esterno
├── docker-compose.yml       # i due servizi
├── Jenkinsfile              # build + deploy
└── CLAUDE.md                # questo file
```

È l'unione di `budget-app` (frontend) e `budget-api` (backend) con `git subtree`:
la storia di entrambi è conservata. `budget-api` resta come repo storico.
Per la storia di un file del backend da prima dell'unione: `git log -- src/<file>`
(prima dell'unione i percorsi non avevano il prefisso `backend/`).

Fuori dal repo, nella cartella `budgetApp/`: `budget-flutter/` (abbandonato) e
file locali da non versionare (`budget.sql` è un dump, `.env`).

## Stack tecnologico

### Backend — `backend/`
- **Strapi 5.38** (headless CMS), Node >= 20 <= 24
- **MySQL 8** (`config/database.js` supporta anche postgres/sqlite)
- Deploy con il `docker-compose.yml` in radice (immagine da `backend/Dockerfile`)
- `pdf-parse` per estrarre il testo dagli estratti conto
- `tesseract.js` (OCR WASM, nessuna dipendenza di sistema) + `@tesseract.js-data/ita`
  (modello locale: niente CDN a runtime) + `sharp` per gli scontrini
- LLM opzionale: Ollama locale, llama.cpp o OpenRouter (scelto dall'utente)

### Web — `frontend/`
- **Vue 3** + **Vite 7**, tutto `<script setup>`
- **PrimeVue 4** (tema Aura, preset in `src/theme.js`) + **Tailwind 4**
- **Pinia** (store options-style) · **vue-router 5** (un solo `beforeEach`)
- **HTTP:** `axios` + `qs`, istanza `api` in `src/services/api.js`
- **Sessione:** JWT in `localStorage` (`token`). L'API si chiama in modo
  relativo (`/api/...`): in produzione inoltra nginx, in sviluppo il proxy di
  Vite (`VITE_PROXY_API`, default `localhost:1337`). `VITE_API_URL` solo per un
  backend su un altro dominio
- **Test:** `npm test` (`node --test`, solo logica pura in `src/utils/`)
- Struttura: `views/` (schermate) · `services/` (chiamate API, niente axios
  dentro le viste) · `stores/` · `utils/` (logica pura testabile) · `components/`

### App — `budget-flutter/` (abbandonata)
- **Flutter**, Dart SDK ^3.11.4, target Android (APK firmato)
- **State management:** `provider` ^6.1.2 (`ChangeNotifier`), 9 provider registrati
  in un `MultiProvider` in `main.dart`
- **HTTP:** `http` ^1.2.2, wrapper statico in `services/api_client.dart`
- **Navigazione:** Navigator 1.0 — due route nominate (`/login`, `/home`) in
  `main.dart` + bottom nav custom a 5 slot in `MainScreen`. **Niente `go_router`.**
- **Sessione:** JWT in `flutter_secure_storage`; URL del server in `shared_preferences`
- **Altro:** `local_auth` (biometria), `flutter_local_notifications` + `timezone`,
  `google_mlkit_text_recognition` (OCR on-device), `home_widget` (widget Android),
  `fl_chart`, `file_picker`, `image_picker`, `share_plus`, `shimmer`, `intl`
- **CI:** `.github/workflows/release-apk.yml` — build firmata su GitHub Releases,
  con `flutter analyze` + `flutter test` obbligatori prima della firma

## Schema dati (Strapi collections)

Attenzione ai nomi: sono misti italiano/inglese e alcuni sono al plurale
"sbagliato" (`transazionis`, `categories`). Non normalizzarli: sono chiavi API.

**Wallet** (`api::wallet.wallet`)
`Nome` string · `Budget` decimal · `escludiDaStatistiche` bool
· `categories` 1-n → Categorie · `salvadanaios` 1-n → Salvadanaio (vecchio)
· `users_permissions_user` n-1 → User *(chi l'ha creato: ownership, mai modificabile dal client)*
· condiviso (§12 di `progetto.md`): `condiviso` bool · `membro` n-1 → User *(l'altra
persona, una sola)* · `regolaTipo` enum `meta|proporzionale|personalizzata`
· `quotaCreatore` decimal 0..1 *(la regola risolta dal server)* · `entrateCreatore`,
`entrateMembro` decimal. `membro` e `condiviso` cambiano **solo** dagli inviti.

**Categorie** (`api::categorie.categorie`, collection `categories`)
`Nome` string · `Budget_categoria` decimal *(per le entrate = "entrata prevista")*
· `icona` string *(emoji)* · `Tipo` enum `uscita|entrata|versamento|rimborso`
(default `uscita`) · `Nascosta` bool · `wallet` n-1 · `transazionis` 1-n

Il **tipo sta sulla categoria**, non sulla transazione. Lo "speso" conta **solo
`Tipo = uscita`** ovunque (Home, Anno, consigli, avvisi, chiusura del mese,
sforamenti dell'analisi): una categoria nuova di tipo diverso va esclusa anche
lì. `versamento` e `rimborso` sono le due categorie **di sistema** (nascoste)
del condiviso, create quando si accetta l'invito: così transazione → categoria
→ wallet resta l'unica catena di proprietà. `Nascosta` = nata da "+ Altro"
senza "Aggiungi alle mie categorie": fuori dalle pillole e dalle Impostazioni,
dentro totali, grafici ed export. Il bootstrap porta a `uscita` i `Tipo` NULL.

**Transazioni** (`api::transazioni.transazioni`, collection `transazionis`)
`Importo` decimal *(sempre positivo: il segno viene dal tipo)* · `Descrizione` string
· `Data` date · `TransazioneRicorrente` bool *(true = template, non istanza)*
· `RicorrenzaTemporale` date *(conta solo il giorno)* · `InPausa` bool
· `Contanti` bool *(esclusa dal confronto con l'estratto conto)* · `categorie` n-1
· condiviso: `pagatoDa` enum `creatore|membro|cassa` · `quota` decimal *(parte di chi
ha creato il portafoglio)* · `quotaCassa` decimal *(fissata dal server alla
creazione: la regola non è retroattiva)* · `creatoDa`, `modificatoDa` n-1 → User
*(li scrive il server)*

**Cartelle del salvadanaio** (`api::cartella.cartella`, collection `salvadanai`)
`Nome` · `Emoji` · `Colore` enum `argilla|nebbia|kaki|pietra|lilla` · `Obiettivo`
decimal · `Standard` bool *("Risparmi mensili", una per wallet, non eliminabile)*
· `wallet` n-1 · `movimenti` 1-n

**Movimenti del salvadanaio** (`api::movimento-salvadanaio.movimento-salvadanaio`,
collection `movimenti_salvadanaio`)
`Importo` decimal *(+ versamento, − prelievo)* · `Data` · `Nota` · `Mese` `AAAA-MM`
*(solo nella cartella standard)* · `Provenienza` 1-1 → movimento *(il mese da cui
arrivano i soldi)* · `Chi` enum `creatore|membro` · `salvadanaio` n-1

**Salvadanaio** (`api::salvadanaio.salvadanaio`) — **vecchio, in sola lettura**
`mese` date · `budgetAllocato` · `speso` · `risparmiato` · `wallet` n-1. Il cron
non lo scrive più; il bootstrap porta i `risparmiato` nei movimenti della
cartella standard (idempotente). Da togliere quando i dati di produzione sono
stati migrati e controllati.

**Invito** (`api::invito.invito`, collection `inviti`)
`email` · `stato` enum `in_attesa|accettato|rifiutato|annullato` · `scadenza` date
(14 giorni) · `wallet`, `da`, `a` n-1. Niente token né email: si invita un
utente **già esistente** e lo si accetta dentro l'app (banner in Home).

**Consiglio** (`api::consiglio.consiglio`)
`tipo` enum `alza|abbassa` · `budgetAttuale` decimal · `budgetProposto` decimal
· `mesiAnalizzati` json · `testo` text · `stato` enum `nuovo|letto|applicato|ignorato`
· `categorie` n-1

**User** (extension `users-permissions`, campi aggiunti)
`orarioNotifiche` time *(solo per le notifiche locali di Flutter: il server non lo usa)*
· `aiMotore` enum `ollama|openrouter|llamacpp` · `aiUrl` string · `aiModello` string
· `aiChiave` string *(private)* · `aiChiaveImpostata` bool
· `aiChiaveLlamacpp` string *(private)* · `aiChiaveLlamacppImpostata` bool
(una chiave per motore: openrouter e llama.cpp sono servizi diversi)
· `nomeVisualizzato` string · `coloreAvatar` enum · `tema` enum `sistema|giorno|notte`
· `avatar` text *(data URL JPEG 256px, scritto **solo** da `POST /api/profilo/foto`,
mai da `PUT /api/users`: niente Media Library, niente `/uploads` da esporre)*

## Backend — cosa c'è di custom

### Controller owner-aware (`src/api/*/controllers/`)
Tutti e 5 (`wallet`, `categorie`, `transazioni`, `salvadanaio`, `consiglio`)
sovrascrivono i core controller per legare ogni record al suo proprietario:

- `find` compone il filtro server-side in **`$and`** con quello del client, così
  il client non può aggirarlo né sovrascriverlo
- `findOne`/`update`/`delete` verificano il proprietario risalendo la catena
  (transazione → categoria → wallet → user) e rispondono `notFound` se non combacia
- "proprietario" vuol dire **chi ha creato il wallet o il suo membro**: la regola
  sta in **un posto solo**, `src/accesso.js` (`filtroWallet`, `puoUsare`,
  `walletDiUtente`, `ruolo`), usato dai 5 controller e dalle rotte custom.
  L'altro membro non deve vedere **nulla** dei portafogli personali di chi l'ha
  invitato (coperto dall'e2e con prove di mutazione)
- `wallet.delete`: solo chi l'ha creato. `wallet.update` toglie
  `users_permissions_user`, `membro`, `condiviso` e ricalcola `quotaCreatore`
- `create` forza l'owner e valida che il parent (wallet/categoria) sia dell'utente
- riassegnare un record a un parent altrui è bloccato esplicitamente
- `salvadanaio.delete` è disabilitato: lo storico non si cancella dal client

**Toccando un controller, mantenere questo schema.** È la sola difesa lato server.

### Rotte custom
- `POST /api/analisi-estratto-conto` — upload 1..N PDF/CSV, ritorna il report
- `POST /api/analisi-test-ai` — "Prova connessione" delle impostazioni AI
- `POST /api/scontrino/leggi` — OCR di una foto (campo `immagine`), ritorna
  `{ totale, descrizione, righeLette }`. **Il permesso non si abilita da solo**:
  Admin → Users & Permissions → Ruoli → Authenticated → Scontrino → `leggi`,
  altrimenti 403 (con più utenti va seedato in bootstrap: fase 5)
- `POST /api/consiglios/:id/applica` — scrive `budgetProposto` sulla categoria
- `POST /api/consiglios/:id/segna` — stato `letto` o `ignorato`
- `POST|DELETE /api/profilo/foto` — foto profilo (campo `foto`, JPG/PNG/WEBP fino
  a 10 MB): `sharp` la ritaglia quadrata e la riduce a 256px JPEG sul server
- `/api/salvadanai` (GET stato, POST crea, PUT `/risparmio`, PUT/DELETE `/:id`,
  POST `/:id/movimenti`, DELETE `/movimenti/:id`) — salvadanaio a cartelle,
  **nessun CRUD generico**: tutta la logica in `src/salvadanai.js`. Saldi mai
  sotto zero e spostamenti "da Risparmi mensili" (due movimenti in una
  transazione DB) verificati sul server. Ogni rotta vuole `wallet`
- `/api/inviti` (GET, POST, `/:id/accetta|rifiuta|annulla`) e
  `POST /api/portafogli/:id/esci` — condiviso; si esce solo a conti pari
  (`src/conti.js`)

### Servizi di analisi (`src/api/analisi/services/`)
- `sella-parser.js` — parser **deterministico** per Banca Sella, due formati
  (conto e carta). Regex con separatori `\s*` perché `pdf-parse` attacca i campi.
  Marca l'addebito mensile della carta per non contare due volte le spese.
- `pdf-parser.js` — testo dal PDF + estrazione del periodo
- `diff-engine.js` — `confronta` restituisce `abbinati`, `mancanti`, `soloApp`,
  `diversi` abbinando **solo movimenti dello stesso tipo** (addebito↔uscita,
  accredito↔entrata); "importo diverso" = entro 3 giorni e una parola in comune.
  Il controller toglie i contanti e, nel condiviso, filtra per "di chi è
  l'estratto conto" (`estratto=mio|cassa`)
- `csv-parser.js` — CSV generico (`data;descrizione;importo` o dare/avere),
  letto senza AI prima dell'LLM. Il parser Sella ora tiene gli accrediti
  (`tipo: 'entrata'`)
- `llm-client.js` — Ollama/OpenRouter con timeout, budget totale e limite blocchi.
  **Fallback, non fonte primaria**: il parser deterministico ha la precedenza.

- `auto-categoria.js` — deduce la categoria di un movimento dalle transazioni
  già registrate (match per parole sulla descrizione, rumore bancario escluso).
  Gira **prima** dell'LLM: se il negozio è già noto la risposta è nel database e
  costa una query. Le regole sono le transazioni stesse, quindi non c'è nessuna
  tabella da mantenere e migliorano quando correggi un suggerimento.

### Scontrino (`src/api/scontrino/`)
- `ocr.js` — worker tesseract **unico per processo**, creato al primo uso e
  spento dopo 5 min di inattività; una lettura alla volta, oltre 3 fra in corso
  e in coda risponde 429; timeout 60s (poi il worker si butta). `sharp` raddrizza
  (EXIF), riduce a 2000px e porta in grigi prima della lettura.
- `parser.js` — totale e negozio dalle righe lette. **Portato da
  `scontrino_service.dart`**, stesse regole e stessi test. Nessun fallback
  "prendi il numero più grande": meglio campo vuoto che importo sbagliato.
- **Privacy:** la foto passa solo in memoria, mai su disco da noi né a servizi
  esterni; il controller la cancella a fine richiesta e `src/middlewares/
  pulisci-upload.js` (globale, dopo `strapi::body`) la cancella anche quando la
  richiesta è respinta prima del controller (403/401), cosa che Strapi non fa.
- Test: `node tests/scontrino-parser.test.js` (puro) e
  `node tests/scontrino-ocr.test.js` (OCR vero su uno scontrino generato con
  sharp: serve un font di sistema). Tutti i test del backend: `for t in
  tests/*.test.js; do node $t; done`.

### Cron (`src/index.js`, `config/server.js` → `cron.enabled: true`)
- `chiudiEApriMese` — `0 23 28-31 * *`: chiude il mese nei "Risparmi mensili"
  di ogni wallet (`salvadanai.chiudiMese`): se l'utente non ha inserito il
  risparmio vale entrate − uscite (se positivo). Il vecchio salvadanaio non si
  scrive più.
- `generaConsigli` — `5 23 28-31 * *`: mediana delle spese sugli ultimi 6 mesi,
  propone di alzare/abbassare i budget. **I numeri li calcola il codice**
  (`motore-consigli.js`), l'LLM scrive solo la frase attorno.
- `materializzaRicorrenti` — `0 6 * * *` (`src/ricorrenti.js`): crea l'istanza
  del mese per ogni template `TransazioneRicorrente=true` in scadenza oggi e
  **non in pausa** (`InPausa` NULL conta come attiva: `$or`, non `$ne`). Copia
  anche `pagatoDa`/quote del condiviso. Anti-doppione per categoria+descrizione
  (non importo: cambiarlo a mese iniziato vale dal mese dopo)

Un filtro `campo: { $ne: valore }` in SQL scarta anche le righe NULL: sui
campi aggiunti dopo (Tipo, InPausa, Nascosta) usare `$or` col `$null` oppure
normalizzare in bootstrap.

Le chiavi mese si costruiscono a mano (`primoDelMese`), mai con `toISOString()`
su una data locale: appena il container ha un fuso a est di Greenwich quel
metodo restituisce il giorno prima e sposta tutto lo storico di un giorno.

### Estensioni
`src/extensions/users-permissions/strapi-server.js` restringe `/api/users/*` al
solo utente che chiama. `update` solo del proprio profilo (e blocca
`role`/`blocked`/`confirmed`); `find`/`findOne`/`count` vedono solo sé stessi;
`create`/`destroy` sempre 403. Serve perché i permessi di users-permissions, di
suo, lasciano leggere, modificare e cancellare qualsiasi utente a chiunque sia
autenticato. **`user.find` va tenuto abilitato** (lo seeda `permessi.js`):
senza, i controller owner-aware falliscono con `Invalid key
users_permissions_user`, perché Strapi 5 valida i filtri sulle relazioni
contro i permessi del ruolo.

Chiude anche `auth.register`, `forgotPassword`, `resetPassword`,
`emailConfirmation`, `sendEmailConfirmation` (403). **Attenzione:** nel plugin
`controllers.auth` è una *factory* `({ strapi }) => ({...})`, non un oggetto
come `controllers.user`: per sovrascriverlo va avvolta, altrimenti l'override
non ha effetto e non dà errori (era successo: lo ha scoperto il test e2e).
`change-password` resta aperto (pagina Profilo).

### Cascata, permessi, SSRF (`src/`)
- `cascata.js` — middleware dei Documents (registrato in `index.js`): eliminare
  un wallet o una categoria elimina anche i figli, in blocchi da 500 e in una
  transazione sola (o tutto o niente). Strapi non lo fa da sé. Non toccare i
  controller per questo: il middleware copre anche il pannello admin. Un
  lifecycle `beforeDelete`/`beforeDeleteMany` sul modello utente elimina prima i
  suoi wallet (e quindi tutto): l'admin cancella gli utenti dal Documents API.
- `scripts/pulisci-orfani.js` — pulizia una tantum dei record orfani (categorie
  senza wallet, transazioni senza categoria, salvadanaio senza wallet, consigli
  senza categoria). **Di default è un'anteprima e non cancella**; `--elimina`
  cancella (fai prima un backup del DB). I wallet SENZA UTENTE non contano come
  orfani (possono essere dati di prima del campo proprietario): si mostrano a
  parte e si cancellano solo con `--wallet-senza-utente`. Nel container:
  `docker exec budget-api node scripts/pulisci-orfani.js`. Non apre porte né
  avvia il cron (`load()` fa solo register e bootstrap). La logica è in
  `cascata.js` (`trovaOrfani`, `eliminaOrfani`), coperta dal test e2e.
  Attenzione ai conteggi con relazioni nulle: con i LEFT JOIN una riga senza
  categoria soddisfa anche "la sua categoria non ha wallet", quindi si conta con
  una query `$or`, non sommando due conteggi.
- `chiavi-ai.js` — `aiChiave` e `aiChiaveLlamacpp` si salvano cifrate
  (AES-256-GCM, formato `enc:v1:iv:tag:testo`) da un lifecycle su create/update,
  quindi anche dall'admin; il bootstrap cifra quelle ancora in chiaro. Si
  decifrano in **un solo punto**, `chiaveDiUtente` in `llm-client.js`: non
  leggere i campi chiave altrove. Segreto: `AI_KEYS_SECRET`, in mancanza
  `ENCRYPTION_KEY`. Nessuna rotazione (commento `ponytail:`).
- `conti.js` — conto tra le due persone del condiviso (§12), funzione pura,
  **replicata** in `frontend/src/utils/conti.js`: stessi test (esempio −226,10).
- `permessi.js` — i permessi dell'app per il ruolo Authenticated, seedati a ogni
  avvio (solo aggiunge, mai toglie). Aggiungendo una rotta custom, aggiungere
  qui la sua azione: il test e2e controlla che ogni nome esista davvero.
- `api/analisi/services/url-ai.js` — con `AI_URL_PRIVATI=blocca` rifiuta gli
  indirizzi AI che risolvono a reti private/loopback/metadata. Controlla solo
  l'URL scelto dall'utente, non `OLLAMA_URL`. Limite noto (commento
  `ponytail:`): DNS rebinding.
- Test e2e: `npm install --no-save better-sqlite3` e poi
  `node tests/sicurezza-e2e.test.js` (Strapi vero su SQLite temporaneo; senza
  il driver si salta). Il driver non è una dipendenza: in produzione c'è MySQL.
  Copre permessi, utenti, cascata (anche con guasto a metà), eliminazione utenti,
  accesso chiuso, chiavi cifrate, SSRF. Ogni protezione nuova va aggiunta qui, e
  conviene verificare che il test **fallisca** disattivandola (mutazione).

### Ambienti e deploy (radice del repo)
- `docker-compose.yml`: `backend` (Strapi, container `budget-api`) e `frontend`
  (nginx, container `budget-app`). **MySQL è esterno**: il backend lo raggiunge
  sulla rete `BUDGET_DB_NETWORK` (default `lavoro-net`). Il backend sta su due
  reti e la `interna` ha **`gw_priority: 1`**: senza, Docker sceglie in ordine
  alfabetico quale rete usa per la porta pubblicata, e se tocca a quella del DB
  la porta admin non risponde (verificato in prova). `gw_priority` richiede
  Docker Engine >= 28.
- `frontend/nginx/default.conf`: dall'esterno passa **solo `/api/`** verso
  `backend:1337`. Il pannello admin (`/admin`, `/content-manager`, ...) non
  arriva a Strapi da lì: sta sulla porta `BUDGET_ADMIN_PORT` (default 1337), da
  limitare al proprio IP. Limiti per rotta: 1 MB di default, 25 MB e 200 s per
  `/api/analisi-estratto-conto` (il client aspetta 3 min: col default nginx di
  60 s l'analisi lunga finirebbe in 504), 16 MB e 100 s per `/api/scontrino/leggi`, 11 MB per `/api/profilo/foto`;
  `/emoji/` servito con cache di 30 giorni.
  **Aggiungendo una rotta con upload o tempi lunghi, aggiungere qui la sua location.**
- `.env` in radice: lo legge compose (variabili `BUDGET_*`, tutte facoltative,
  vedi `.env.example`) e arriva al backend come ambiente (`env_file`). Contiene
  anche tutte le variabili di `backend/.env.example`. Formato: una variabile per
  riga, **senza virgolette**.
- `Jenkinsfile`: la credenziale file `budget-api-env` diventa `.env`, poi
  `docker compose up -d --build --wait` (ricrea solo il servizio cambiato). Al
  primo deploy toglie i container `budget-api`/`budget-app` creati col vecchio
  `docker run` (compose non li riconoscerebbe). Upload in
  `/DATA/AppData/budgetapi` (come prima). Non c'è più il push sul registry Gitea.
- `backend/Dockerfile`: `node:22-alpine` (Strapi 5.38 richiede Node `>=20 <=24`),
  `npm ci`. `frontend/Dockerfile`: build Vite + nginx, nessun indirizzo nel bundle.
- `.env.develop`: stesso schema per un ambiente develop, con segreti e database
  DIVERSI dalla produzione. Se gira sulla stessa VM servono anche
  `BUDGET_FRONTEND_PORT`, `BUDGET_ADMIN_PORT` e `BUDGET_UPLOADS_PATH` diversi
  (e un nome di progetto compose diverso: `docker compose -p budget-develop`).
- Variabili nuove: `AI_KEYS_SECRET` (cifratura chiavi AI), `AI_URL_PRIVATI`
  (`consenti`|`blocca`).

## Frontend web — convenzioni (`frontend/`)

- **Errori:** i service lanciano, lo store/la vista catturano e mostrano
  `erroreLeggibile(e)` (toast o box rosso). 401 chiude la sessione
  (`impostaSessioneScaduta` in `main.js`); **403 no**: è un permesso Strapi
  mancante su quella rotta, errore della singola chiamata.
- **Filtro per mese:** lo fa il server (`services/dashboard.js`). Mai
  `populate=*` sulle transazioni. Le liste paginate passano da `elencaTutte`;
  dove si mostrano somme su molte righe (anno, export) si usa `elencaConTotale`
  e si dice all'utente se `righe.length < totale`: un totale parziale che si
  spaccia per completo non dà segnali.
- **Date:** le date Strapi sono stringhe `YYYY-MM-DD`: non passarle da
  `new Date("...")` (UTC, a ovest di Greenwich slitta di un giorno). Helper
  in `utils/budget.js`.
- **Dopo POST/PUT/DELETE:** si ricarica dal server (`dashboard.carica()`).
- **Logout:** azzera gli store e scarta le richieste in volo, perché con più
  utenti i dati non devono sopravvivere al cambio sessione.
- **Colori nuovi:** si aggiungono in `@theme static` di `main.css` (non `@theme`:
  Tailwind 4 emette solo le variabili usate da una classe, e PrimeVue/Chart.js
  le leggono senza passare da una classe). Nei grafici: `token("nome")`.
- **`utils/ricorrenza.js`** replica la regola del cron `materializzaRicorrenti`
  (backend): se cambia una, cambiare l'altra.
- **Dati che arrivano dopo il mount:** i portafogli li scarica la testata, in
  modo asincrono. Una vista che li serve non li legge una volta sola in
  `onMounted`: li guarda con `watch(() => walletStore.walletId, ..., { immediate: true })`
  (altrimenti con un refresh diretto resta vuota).
- **Avvisi del server nel report di analisi:** `validazione.warning` si mostra
  SEMPRE quando c'è, non solo con `ok` falso. Il server lo valorizza anche
  quando l'AI non ha risposto (con `ok: true`), ed è l'unico segnale che il
  report è parziale.
- **Campi importo nuovi:** valore iniziale `null` e non `0`, così si digita
  subito invece di dover selezionare `0,00 €`.
- **Provare le schermate davvero:** `npm run build` e i test non bastano (due
  bug di questo tipo sono emersi solo nel browser). Si può avviare il `backend`
  su SQLite con una cartella app temporanea *senza* `database/migrations`
  (la migrazione `llamacpp` usa `MODIFY COLUMN`, solo MySQL), `vite` con
  `VITE_API_URL` puntato lì, e pilotare un Chromium isolato (non il Chrome
  dell'utente) con `browser-use` e `BU_CDP_URL`.
- **Impostazioni** è una pagina sola con le sezioni per hash
  (`/impostazioni#profilo`, `#portafogli`, `#categorie`, `#ricorrenti`,
  `#aspetto`, `#export`, `#notifiche`, `#ai`); i vecchi indirizzi
  (`/impostazioni/ai`, `/ricorrenti`, `/export`) reindirizzano lì.
- **Transazioni**: `/transazioni/:id` apre la modifica nello stesso foglio;
  `?tipo=entrata|uscita|versamento` e `?ricorrente=1` precompilano il form.
- **Condiviso**: chi guarda è `creatore` o `membro` (`walletStore.mioRuolo`); le
  quote sono salvate dal punto di vista del creatore e si girano in
  `utils/conti.js` (`miaQuota`, `bilancio(…, io)`). Il conto tra voi conta tutti
  i movimenti di sempre (`dashboard.conto`), non solo quelli del mese.
- **Logica pura** (calcoli, date, formati) in `utils/`, senza import Vue, con
  test in `node --test`.

## App Flutter — mappa (riferimento funzionale)

### Schermate (`lib/screens/`)
| File | Cosa fa |
|---|---|
| `login_screen.dart` | login, URL server configurabile, sblocco biometrico |
| `main_screen.dart` | shell: AppBar con chip portafogli + bottom nav a 5 slot con FAB centrale |
| `home_screen.dart` | dashboard: navigazione mesi (**ricarica dal server a ogni cambio**), card riepilogo, categorie espandibili, proiezione fine mese, export CSV, campanella consigli |
| `transazioni_screen.dart` | form nuova/modifica transazione + scansione scontrino OCR |
| `salvadanaio_screen.dart` | risparmio del mese editabile, totale storico, grafico trend |
| `analisi_screen.dart` | upload estratti conto, report sforamenti/mancanti/giudizio |
| `impostazioni_screen.dart` | lista di sottopagine: profilo, portafogli, categorie, ricorrenti, notifiche, sicurezza, analisi AI |
| `consigli_screen.dart` | consigli sul budget, applica/ignora con un tap |
| `ricorrenti_screen.dart` | elenco ricorrenti con la prossima scadenza |

### Provider (`lib/providers/`)
`auth` · `wallet` · `dashboard` · `transazione` · `salvadanaio` · `impostazioni`
· `user_settings` · `analisi` · `consigli`

### Servizi degni di nota (`lib/services/`)
- `api_client.dart` — `UnauthorizedException` (401 → chiude la sessione) vs
  `ForbiddenException` (403 → errore della singola chiamata, **non** logout),
  `erroreLeggibile()` per i messaggi all'utente, `requireToken(context)`
- `soglia_service.dart` — avvisi di superamento budget durante il mese +
  proiezione di fine mese. Funzioni pure, testate.
- `ricorrenza.dart` — prossima scadenza con clamp sui mesi corti (31 → 28/29/30).
  **Replica la regola del cron backend: se cambia una, cambiare l'altra.**
- `scontrino_service.dart` — OCR on-device, la foto non lascia il telefono
  (in Vue l'OCR è sul server: vedi sezione Scontrino).
  Nessun fallback "prendi il numero più grande": meglio campo vuoto che importo sbagliato.
- `notification_service.dart` — ricorrenti pianificate + avvisi soglia. No-op su web.
- `widget/widget_bridge.dart` — push dei numeri al widget Android
  (`android/.../widget/BudgetWidgetProvider.kt`). Il widget non ha rete: riceve e basta.

### Test (`test/`)
`soglia_service_test` · `ricorrenza_test` · `scontrino_service_test`
· `widget_snapshot_test` · `widget_test`. Coprono la logica pura, non le API.

## Design system

Mockup e decisioni in `budgetApp/demoThomas/` (`progetto.md` §9 e §14).
Antracite calda + **blocchi di colore pieno con testo nero**; un colore = un
significato. Modalità **Notte, Giorno e Sistema**: la preferenza sta in
`localStorage` (`budget.tema`) e sull'utente (`tema`); lo script in testa a
`index.html` la applica prima del primo disegno, poi `src/tema.js`.

I colori stanno **solo** in `frontend/src/assets/main.css` (`@theme static`; i
valori Giorno in `:root[data-theme="light"]`), PrimeVue li legge da
`src/theme.js` (sempre lo schema "dark" di Aura: cambiano le variabili, non lo
schema), i grafici con `token("nome")`. Nelle viste solo classi, mai hex.

| Token | Notte | Giorno | Uso |
|---|---|---|---|
| `fondo` | `#1b1a18` | `#f4f1ec` | fondo pagina |
| `card` | `#262522` | `#fdfcfa` | pannelli |
| `campo` | `#302e2a` | `#efebe4` | pillole, superfici interne, campi |
| `testo` / `testo2` | `#efe6da` / `#a39d94` | `#1b1a18` / `#64605a` | testo |
| `salvia` | `#c3cc8c` | = | **entrate** (blocco, testo nero sopra, 10,7:1) |
| `arancio` | `#f5a574` | = | **uscite**, sforato, Elimina (9,1:1) |
| `crema` | `#e8d8c9` | `#e5cfb8` | saldo, risparmio, azione principale (13,1:1) |
| `ardesia` | `#4b607f` | = | informazione, testo `su-inchiostro` sopra (5,2:1) |
| `fg-positivo` | `#c3cc8c` | `#5b6a22` | **testo** degli importi in entrata |
| `fg-negativo` | `#eb827b` | `#b3423a` | **testo** degli importi in uscita |
| `fg-avviso` / `fg-accento` | `#f5a574` / `#e8d8c9` | `#9e4e1a` / `#7d5f44` | errori / accenti |
| `chart-1..6` | palette validata | = | grafico, il colore **segue la categoria** |
| `av-*`, `persona-*` | toni chiari | = | avatar e salvadanai (il lilla è dell'altra persona) |

Il testo d'accento ha token propri perché crema, salvia e arancio come testo
sparirebbero sul fondo chiaro. Sui blocchi colorati le etichette restano nere
piene (il nero attenuato scende sotto 4,5:1). **Prima di cambiare un colore,
ricalcolare** i contrasti (la tabella di `progetto.md` §9/§14).

Convenzioni:
- Font Geist / Geist Mono, icone **Phosphor Bold** (`ph-bold ph-...`, niente
  PrimeIcons), emoji Apple come immagini (`<Emoji e="🛒" />`, PNG servite in
  locale da `/emoji`, vedi `vite.config.js`)
- Testata: `.eyebrow` + `.display`; pannelli `.panel` (28px), blocchi `.blocco`
  (**non** `.block`: collide con l'utility `block` di Tailwind), bottoni
  `.pill-btn--cream|ink|ghost`, selettori `.seg`, campi `.campo`
- Importi con `eur()` / `<Euro :v>` (`utils/formato.js`): "€1.388,00" coi
  decimali attenuati, il negativo porta il segno "−", non solo il colore
- Pillola di navigazione flottante (Home · Transazioni · Analisi ·
  Impostazioni), scura anche di giorno (token `dock-*`); il salvadanaio è il
  cerchio crema nell'header
- Pagine verificate a 1280, 375 e 320 px: niente sbordamenti (`minmax(0,1fr)`,
  `min-w-0`, `truncate` dove serve)

## Pattern comuni nel codice (Flutter, riferimento)

- **Caricamento per schermata:** `didChangeDependencies` + `addPostFrameCallback`
  - un `_ultimoWalletCaricato` per non ricaricare a ogni rebuild
- **Filtro per wallet:** `categorie.where((c) => c.walletDocumentId == selectedWallet.documentId)`
- **Filtro per mese:** lo fa il **server**. `DashboardService` chiama categorie e
  transazioni separatamente e ricompone; i template ricorrenti arrivano in una
  lista a parte (`DashboardProvider.ricorrenti`) perché vivono nel mese in cui
  sono stati creati. Non tornare al vecchio `populate=*`: in Strapi 5 le
  relazioni popolate non si possono limitare e il payload cresce senza tetto.
- **Dopo POST/PUT/DELETE:** si richiama `loadCategorie()` invece di aggiornare
  a mano lo stato locale
- **Errori:** ogni provider cattura e salva in `errore`, la schermata lo mostra
  in un box rosso. Mai eccezioni che risalgono alla UI.
- **Debounce input:** `Timer` da 800ms nelle impostazioni (nome/budget wallet)
- Commenti `// ponytail:` marcano semplificazioni deliberate col loro limite noto.
  Non "correggerli" senza motivo: sono scelte, non sviste.

## Approccio sviluppo

Vezzo ha esperienza forte in Vue 3, Strapi, Docker, MySQL/PostgreSQL, Linux, Git.

Quando si assiste:

- Aprire ogni risposta operativa con un **riassunto** di 2-4 righe: direzione del
  momento + file/aree che si stanno per toccare
- Spiegare il **perché** di una scelta tecnica, non solo il cosa
- Presentare alternative con pro e contro, poi **consigliarne una**
- Scrivere codice solo quando richiesto esplicitamente
- Pragmatismo: *"shipped is better than perfect"*. Niente over-engineering,
  niente astrazioni speculative, niente scaffolding "per dopo".
- **Multi-utente**: gli account li crea solo Vezzo dall'admin; niente
  registrazione né recupero password. Il portafoglio condiviso (una sola altra
  persona, invito verso un utente esistente, senza email) c'è dal 2026-11-23.
  Restano fuori ruoli complessi, gamification e analytics di retention, finché
  Vezzo non li chiede.
- Prima di consegnare una modifica al frontend: `npm run build` e `npm test`
  in `frontend/`.
