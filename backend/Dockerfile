# Strapi 5.38 richiede Node >=20 <=24 (vedi "engines" in package.json). Node 18 è
# fuori supporto da aprile 2025. 22 è l'LTS compreso nell'intervallo.
FROM node:22-alpine

# Installa le dipendenze necessarie
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev > /dev/null 2>&1

# Imposta la directory di lavoro
WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze esattamente come da package-lock.json (npm ci):
# `npm install` può risolvere versioni diverse da quelle provate.
RUN npm ci --no-audit --no-fund

# Copia i file del progetto
COPY . .

# Le variabili d'ambiente (segreti, DB, ecc.) NON vanno mai scritte qui dentro:
# vengono fornite a runtime dal container (docker-compose env_file / --env-file).
# Vedi .env.example per l'elenco completo delle variabili richieste.
ENV NODE_ENV=production

# Build del pannello di amministrazione
RUN npm run build

# Espone la porta 1337
EXPOSE 1337

# Comando per avviare l'applicazione
CMD ["npm", "run", "start"]