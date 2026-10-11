#!/bin/sh
set -eu
STORE="/home/node/.bloks"
if [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != "$STORE" ]; then
  echo "FATAL: attach a persistent Railway Volume mounted at $STORE."
  echo "Refusing to start without durable Bloks storage."
  exit 78
fi
if [ "${BLOKS_LOOPBACK_ONLY:-}" = "1" ]; then
  echo "FATAL: loopback-only backend cannot accept remote Android pairing."
  exit 78
fi
mkdir -p "$STORE"
chown -R node:node "$STORE"
chmod 700 "$STORE"
mkdir -p "$STORE/codex"
chown node:node "$STORE/codex"
chmod 700 "$STORE/codex"
exec gosu node node /opt/diza-live/boot.mjs
