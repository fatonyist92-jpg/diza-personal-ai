#!/usr/bin/env bash
# Free GitHub Codespaces development environment only; no background hosting.
set -euo pipefail
export PIP_DISABLE_PIP_VERSION_CHECK=1
export MPLBACKEND=Agg
echo "[Bloks F5 CPU] Installing CPU-only PyTorch..."
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cpu "torch==2.5.1" "torchaudio==2.5.1"
echo "[Bloks F5 CPU] Installing F5-TTS in isolated Codespace..."
python -m pip install "f5-tts==1.1.22" "huggingface-hub>=0.26" "soundfile"
echo "[Bloks F5 CPU] Dependencies installed; run:"
echo "python diza-live/f5-codespaces-cpu/benchmark.py"
