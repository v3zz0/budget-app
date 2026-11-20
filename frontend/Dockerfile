# Build del bundle Vite, poi solo i file statici dentro nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Niente VITE_API_URL: l'app chiama /api sullo stesso indirizzo e nginx inoltra
# al backend, quindi la stessa immagine vale per qualunque dominio.
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
