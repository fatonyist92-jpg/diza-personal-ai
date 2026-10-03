#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
if [[ -z "$major" || "$major" -lt 22 ]]; then
  echo "DIZA membutuhkan Node.js 22+."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@10 --activate
fi
if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex
fi

if [[ "${1:-}" != "--skip-build" ]]; then
  pnpm install --frozen-lockfile
  pnpm build
  pnpm build:server
fi

test -f dist/index.html
test -f dist-server/index.js

STATE_DIR="$HOME/.diza"
PASS_FILE="$STATE_DIR/server-password.txt"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" || true
if [[ ! -s "$PASS_FILE" ]]; then
  node -e "const c=require('crypto'); process.stdout.write(c.randomBytes(32).toString('base64url'))" > "$PASS_FILE"
  chmod 600 "$PASS_FILE" || true
fi

export DIZA_WEB_MODE=1
export DIZA_WEB_PASSWORD="$(cat "$PASS_FILE")"
export BLOKS_STATIC_DIR="$ROOT/dist"
export BLOKS_PORT=8799
export BLOKS_LOOPBACK_ONLY=1

node dist-server/index.js >"$STATE_DIR/server-out.log" 2>"$STATE_DIR/server-error.log" &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8799/api/diza/session >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    cat "$STATE_DIR/server-error.log" >&2 || true
    exit 1
  fi
  sleep 0.5
done

echo "DIZA local: http://127.0.0.1:8799"
echo "Password : $PASS_FILE"
echo "Jangan tutup terminal ini."
exec npx --yes hostc@latest 8799 --qr
