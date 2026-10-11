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
# OpenCode keeps provider auth, configuration and agent sessions in XDG paths.
# Back both paths with the SAME existing Railway volume so login survives
# restarts/redeploys. Never put credentials into a Docker layer or logs.
mkdir -p "$STORE/opencode/data" "$STORE/opencode/config"
chown -R node:node "$STORE/opencode"
chmod 700 "$STORE/opencode" "$STORE/opencode/data" "$STORE/opencode/config"
mkdir -p /home/node/.local/share /home/node/.config
chown node:node /home/node/.local /home/node/.local/share /home/node/.config
if [ -e /home/node/.local/share/opencode ] && [ ! -L /home/node/.local/share/opencode ]; then
  echo "FATAL: OpenCode data path exists outside persistent Railway volume."
  exit 78
fi
if [ -e /home/node/.config/opencode ] && [ ! -L /home/node/.config/opencode ]; then
  echo "FATAL: OpenCode config path exists outside persistent Railway volume."
  exit 78
fi
ln -sfn "$STORE/opencode/data" /home/node/.local/share/opencode
ln -sfn "$STORE/opencode/config" /home/node/.config/opencode
exec gosu node node /opt/diza-live/boot.mjs
