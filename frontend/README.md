# BudgetApp — Frontend web (Vue 3)

Frontend web di **BudgetApp**, app di gestione budget personale multi-portafoglio.
Consuma le API REST del backend Strapi ([budget-api](https://github.com/v3zz0/budget-api)).

## ✨ Funzionalità

- 💼 **Multi-portafoglio** — più portafogli indipendenti (es. Casa, Affitto, Spese Personali), ognuno con il proprio budget mensile.
- 📊 **Dashboard mensile** — *Budget / Speso / Rimanente* per categoria con barra di avanzamento; navigazione tra i mesi; sforamenti in rosso; categorie espandibili.
- 🏷️ **Categorie con budget e icone** — budget mensile, icona e ricorrenza per ogni categoria.
- ➕ **Transazioni rapide** — importo, categoria, data, descrizione e toggle *ricorrente*.
- 🐷 **Salvadanaio** — risparmi mese per mese (`budget − speso`) con totale storico.
- 🤖 **Analisi estratto conto (AI)** — carichi il PDF della banca e un LLM locale (Ollama) trova sforamenti e transazioni mancanti.
- 🔔 **Notifiche** — promemoria addebiti ricorrenti a orario configurabile.
- ⚙️ **Impostazioni** — gestione portafogli e categorie (crea/modifica/elimina multipla).
- 📤 **Export CSV** · 🔐 **Login JWT** · 🌙 **UI dark banking-style**.

## 📸 Screenshot

| Dashboard | Salvadanaio | Nuova transazione |
|---|---|---|
| ![Dashboard](https://raw.githubusercontent.com/v3zz0/budget-api/main/screenshots/dashboard.jpg) | ![Salvadanaio](https://raw.githubusercontent.com/v3zz0/budget-api/main/screenshots/salvadanaio.jpg) | ![Nuova transazione](https://raw.githubusercontent.com/v3zz0/budget-api/main/screenshots/nuova-transazione.jpg) |

| Analisi estratto conto (AI) | Impostazioni |
|---|---|
| ![Analisi](https://raw.githubusercontent.com/v3zz0/budget-api/main/screenshots/analisi.jpg) | ![Impostazioni](https://raw.githubusercontent.com/v3zz0/budget-api/main/screenshots/impostazioni.jpg) |

## 🧱 Stack

- **Vue 3** + **Vite 7**
- **PrimeVue 4.5** + **Tailwind CSS 4** (UI)
- **Pinia** (state), **vue-router 5**, **axios**, **chart.js**, **zod**

## ✅ Prerequisiti

- **Node.js** `>= 20`
- Il backend [budget-api](https://github.com/v3zz0/budget-api) in esecuzione

## 🚀 Sviluppo

```bash
git clone https://github.com/v3zz0/budget-app.git
cd budget-app
npm install

# Configura l'URL del backend
cp .env.example .env        # imposta VITE_API_URL (default http://localhost:1337)

npm run dev                 # http://localhost:5173
```

### Variabili d'ambiente (`.env`)

| Variabile | Descrizione | Default |
| --- | --- | --- |
| `VITE_API_URL` | URL base del backend Strapi | `http://localhost:1337` |
| `VITE_TITLE` | Titolo dell'app | `budgetApp` |

> `.env` è in `.gitignore`. Le variabili `VITE_*` finiscono nel bundle: **non** metterci segreti.

## 📦 Build di produzione

```bash
npm run build     # output in dist/
npm run preview   # anteprima locale del build
```

## 🐳 Docker

```bash
# L'URL del backend è un build-arg (viene "baked" nel bundle da Vite)
docker build --build-arg VITE_API_URL=https://tuo-backend -t budget-app .
docker run -p 8017:80 budget-app
# oppure: docker compose up -d --build
```

## 🔗 Correlati

- Backend + guida completa: [budget-api](https://github.com/v3zz0/budget-api)
- App Android: [budget-flutter](https://github.com/v3zz0/budget-flutter)
