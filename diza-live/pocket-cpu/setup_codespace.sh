#!/usr/bin/env bash
# Install isolated Pocket Indonesian CPU worker dependencies for a disposable Codespace.
# Never deploys or patches Railway, main, Call UI or other applications.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PIP_DISABLE_PIP_VERSION_CHECK=1
export HF_HUB_DISABLE_TELEMETRY=1
export TOKENIZERS_PARALLELISM=false
echo "[Pocket CPU staging] Installing FFmpeg only if needed..."
if ! command -v ffmpeg >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg
fi
echo "[Pocket CPU staging] Installing CPU-only PyTorch..."
python -m pip install --quiet --index-url https://download.pytorch.org/whl/cpu 'torch>=2.5,<3' 'torchaudio>=2.5,<3'
echo "[Pocket CPU staging] Installing model runtime and authenticated API..."
python -m pip install --quiet 'pocket-tts==3.1.0' 'huggingface-hub>=0.30,<1' \
 'fastapi>=0.110,<1' 'uvicorn>=0.30,<1' 'numpy>=1.26,<3' 'soundfile>=0.12,<1'
python -m py_compile diza-live/pocket-cpu/pocket_service.py
echo "[Pocket CPU staging] Ready. Start only when testing a call: bash diza-live/pocket-cpu/start_codespace.sh"
