# Fase di build
FROM node:22-alpine as build-stage
# Imposta la directory di lavoro nel container
WORKDIR /app
# Copia package.json e package-lock.json
COPY package*.json ./
# Installa le dipendenze
RUN npm install
# Copia i file del progetto nella directory di lavoro
COPY . .
# URL del backend, configurabile a build-time: `docker build --build-arg VITE_API_URL=...`
ARG VITE_API_URL=http://localhost:1337
# Crea file .env con le variabili d'ambiente (Vite le bakes nel bundle)
RUN echo "VITE_API_URL=${VITE_API_URL}" > .env
RUN echo "VITE_TITLE=budgetApp" >> .env
# Compila l'applicazione per la produzione
RUN npm run build

# Fase di produzione
FROM nginx:stable-alpine as production-stage
# Copia i file compilati dalla fase di build
COPY --from=build-stage /app/dist /usr/share/nginx/html
# Copia il file di configurazione di Nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# Espone la porta 80
EXPOSE 80
# Avvia Nginx
CMD ["nginx", "-g", "daemon off;"]