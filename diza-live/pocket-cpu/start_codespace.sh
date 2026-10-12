#!/usr/bin/env bash
# Starts the *isolated* authenticated CPU voice API in an active Codespace.
# Never changes Railway or Bloks. The process stops with Codespace sleep.
set -euo pipefail
cd "$(dirname "$0")/../.."
LOCAL="$PWD/diza-live/pocket-cpu/.local"
mkdir -p "$LOCAL"
chmod 700 "$LOCAL"
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_ENABLE_HF_TRANSFER=0
export TOKENIZERS_PARALLELISM=false
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
export POCKET_REFERENCE_WAV="$LOCAL/ref_reporter_48k_mono.wav"
TOKEN_FILE="$LOCAL/auth-token"
if [[ -z "${POCKET_VOICE_TOKEN:-}" ]]; then
  if [[ ! -s "$TOKEN_FILE" ]]; then
    python -c 'import secrets,sys; from pathlib import Path; Path(sys.argv[1]).write_text(secrets.token_urlsafe(42))' "$TOKEN_FILE"
  fi
  chmod 600 "$TOKEN_FILE"
  export POCKET_VOICE_TOKEN="$(cat "$TOKEN_FILE")"
fi
if [[ "${#POCKET_VOICE_TOKEN}" -lt 24 ]]; then
  echo "ERROR: POCKET_VOICE_TOKEN must be >=24 characters" >&2
  exit 1
fi
if [[ ! -s "$POCKET_REFERENCE_WAV" ]]; then
  echo "[Pocket CPU] Preparing approved public F5 reporter reference locally..."
  MP3="$(python - <<'PY'
from huggingface_hub import hf_hub_download
print(hf_hub_download(repo_id="Eempostor/F5-TTS-INDO-FINETUNE-V2",filename="ref_reporter.mp3",local_dir="diza-live/pocket-cpu/.local"))
PY
)"
  ffmpeg -hide_banner -loglevel error -y -i "$MP3" -ac 1 -ar 48000 "$POCKET_REFERENCE_WAV"
fi
echo "[Pocket CPU] Auth token stored locally at $TOKEN_FILE (never committed)"
echo "[Pocket CPU] Listening on port 8765. Codespaces ports are PRIVATE unless you explicitly change them."
echo "[Pocket CPU] Railway and locked Bloks app remain unchanged."
exec python -m uvicorn pocket_service:app --app-dir diza-live/pocket-cpu --host 0.0.0.0 --port 8765 --no-access-log --workers 1
