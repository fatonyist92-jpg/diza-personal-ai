#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

: "${DIZA_WEB_PASSWORD:?Set DIZA_WEB_PASSWORD before running this installer}"
if [ "${#DIZA_WEB_PASSWORD}" -lt 16 ]; then
  echo "DIZA_WEB_PASSWORD must be at least 16 characters."
  exit 1
fi

REPO_URL="${DIZA_REPO_URL:-https://github.com/fatonyist92-jpg/diza-personal-ai.git}"
BRANCH="${DIZA_BRANCH:-bloks-diza-web}"
INSTALL_DIR="${DIZA_INSTALL_DIR:-/opt/diza-ai}"

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl git docker.io docker-compose-v2
$SUDO systemctl enable --now docker

PUBLIC_IP="${DIZA_PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
fi
if ! [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not detect a public IPv4 address. Set DIZA_PUBLIC_IP and run again."
  exit 1
fi
DIZA_HOST="${DIZA_HOST:-${PUBLIC_IP}.sslip.io}"

if [ -d "$INSTALL_DIR/.git" ]; then
  $SUDO git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  $SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
  $SUDO git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  $SUDO rm -rf "$INSTALL_DIR"
  $SUDO git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

ENV_FILE="$INSTALL_DIR/deploy/oracle/.env"
umask 077
cat > /tmp/diza-oracle.env <<EOF
DIZA_WEB_PASSWORD=$DIZA_WEB_PASSWORD
DIZA_HOST=$DIZA_HOST
EOF
$SUDO install -m 600 /tmp/diza-oracle.env "$ENV_FILE"
rm -f /tmp/diza-oracle.env

cd "$INSTALL_DIR/deploy/oracle"
$SUDO docker compose --env-file .env up -d --build

echo
echo "DIZA host: https://$DIZA_HOST"
echo "Persistent data: Docker volume diza-data"
echo "Codex login: open DIZA > Settings > Engines > Codex > Sign in"
echo
echo "Important: Oracle VCN ingress must allow TCP 80 and 443."
