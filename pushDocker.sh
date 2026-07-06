#!/bin/bash

# Build + push dell'immagine frontend su GitHub Container Registry (GHCR).
#
# ⚠️  NON scrivere MAI il token qui dentro: questo file è nel repo PUBBLICO.
#     Il login è interattivo (username + PAT con scope `write:packages`),
#     oppure esporta GHCR_TOKEN prima di lanciare lo script.
#
# NB: l'URL del backend viene "baked" nel bundle Vite a build-time.
#     Impostalo con la variabile VITE_API_URL (default: http://localhost:1337).

# ─── CONFIGURAZIONE ───────────────────────────────────────────────────────────
IMAGE="ghcr.io/v3zz0/budget-app"
VERSION="1.0"
API_URL="${VITE_API_URL:-http://localhost:1337}"
# ──────────────────────────────────────────────────────────────────────────────

set -e

MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
FULL_IMAGE="${IMAGE}:${VERSION}"

echo "==> Immagine: $FULL_IMAGE"
echo "==> VITE_API_URL (baked nel bundle): $API_URL"

if ! sudo docker info > /dev/null 2>&1; then
    echo "Errore: Docker non raggiungibile."
    exit 1
fi

# Login a GHCR
if [ -n "$GHCR_TOKEN" ]; then
    echo "==> Login a ghcr.io (da GHCR_TOKEN)..."
    echo "$GHCR_TOKEN" | sudo docker login ghcr.io -u v3zz0 --password-stdin
else
    echo "==> Login a ghcr.io (username: v3zz0, password: il tuo PAT con scope write:packages)"
    sudo docker login ghcr.io -u v3zz0
fi

# Build (passa l'URL del backend come build-arg)
echo ""
echo "==> Build: $FULL_IMAGE"
sudo docker build --build-arg VITE_API_URL="$API_URL" -t "$FULL_IMAGE" .
sudo docker tag "$FULL_IMAGE" "${IMAGE}:latest"

# Push
echo ""
echo "==> Push: $FULL_IMAGE"
sudo docker push "$FULL_IMAGE"
sudo docker push "${IMAGE}:latest"

# Incrementa minor e aggiorna lo script
NEW_MINOR=$((MINOR + 1))
NEW_VERSION="${MAJOR}.${NEW_MINOR}"
sed -i "s/^VERSION=\"${VERSION}\"/VERSION=\"${NEW_VERSION}\"/" "$0"

echo ""
echo "==> Fatto! Immagine: ${FULL_IMAGE} (e :latest). Prossima versione: ${NEW_VERSION}"
echo "    Ricorda: per un backend diverso lancia con VITE_API_URL=https://tuo-backend ./pushDocker.sh"
