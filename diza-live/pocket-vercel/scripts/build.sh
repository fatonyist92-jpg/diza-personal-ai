#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "ISOLATED_POCKET_VERCEL_BUILD=BEGIN"
mkdir -p api/voice-assets
RELEASE="https://github.com/fatonyist92-jpg/diza-personal-ai/releases/download/bloks-pocket-onnx-id-v1/pocket-cpu-id-v1.tar.gz"
curl -fL --retry 2 --connect-timeout 20 --max-time 180 "$RELEASE" -o /tmp/pocket-cpu-id-v1.tar.gz
test -s /tmp/pocket-cpu-id-v1.tar.gz
tar -xzf /tmp/pocket-cpu-id-v1.tar.gz -C api/voice-assets
rm -f /tmp/pocket-cpu-id-v1.tar.gz
test -f api/voice-assets/models/flow_lm_main_int8.onnx
test -f api/voice-assets/libonnxruntime.so
test -f api/voice-assets/pocket-tts
chmod +x api/voice-assets/pocket-tts
mkdir -p api/voice-assets/voices
curl -fL --retry 2 --connect-timeout 20 --max-time 90 \
  "https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2/resolve/main/ref_reporter.mp3" \
  -o api/voice-assets/voices/ref_reporter.mp3
test "$(stat -c%s api/voice-assets/voices/ref_reporter.mp3)" -gt 1000
echo "PACKAGED_CPU_ASSET_MB=$(du -sm api/voice-assets|cut -f1)"
echo "ISOLATED_POCKET_VERCEL_BUILD=PASS"
