#!/usr/bin/env bash
# Free GitHub Codespaces development environment only; no background hosting.
set -euo pipefail
export PIP_DISABLE_PIP_VERSION_CHECK=1
export MPLBACKEND=Agg
echo "[Bloks F5 CPU] Installing FFmpeg/FFprobe for the reference MP3..."
if ! command -v ffprobe >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg
fi
ffprobe -version | head -1
echo "[Bloks F5 CPU] Installing CPU-only PyTorch..."
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cpu "torch==2.5.1" "torchaudio==2.5.1"
echo "[Bloks F5 CPU] Installing F5-TTS in isolated Codespace..."
python -m pip install "f5-tts==1.1.22" "transformers==4.47.1" "huggingface-hub>=0.26,<1.0" "soundfile"
echo "[Bloks F5 CPU] Dependencies installed; run:"
echo "python diza-live/f5-codespaces-cpu/benchmark.py"
