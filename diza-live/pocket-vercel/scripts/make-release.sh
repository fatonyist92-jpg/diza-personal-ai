#!/usr/bin/env bash
set -euo pipefail
# Build a pinned, redistributable Pocket Indonesian CPU staging bundle using
# isolated GitHub CI. No production Bloks or Railway files touched.
cd "$(dirname "$0")/../../.."
ROOT="$PWD"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "VOICE_RELEASE_BUILD=START"
git clone -q https://github.com/netai369/PocketTTS.cpp-multilingual.git "$TMP/src"
git -C "$TMP/src" checkout -q 3ed176a2b238b7ddb62b4aea4e7469ae4bcc3489
python -m pip install --quiet 'cmake>=3.30,<5' 'huggingface-hub>=0.30,<1'
cmake -S "$TMP/src" -B "$TMP/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$TMP/build" -j2

mkdir -p "$TMP/bundle/models" "$TMP/bundle/voices"
cp "$TMP/src/pocket-tts" "$TMP/bundle/"
cp "$TMP/src/libonnxruntime.so" "$TMP/bundle/"
export BUNDLE_MODELS="$TMP/bundle/models" BUNDLE_VOICES="$TMP/bundle/voices"
python - <<'PY'
from huggingface_hub import hf_hub_download
from pathlib import Path
import shutil,os
rev="382fe85ca848546efb04bf1b7fdba78c6396e2ce"
files=("flow_lm_main_int8.onnx","flow_lm_flow_int8.onnx","mimi_decoder_int8.onnx",
       "mimi_encoder.onnx","text_conditioner.onnx","tokenizer.model",
       "bos_before_voice.npy","bundle.json")
for item in files:
    source=hf_hub_download(repo_id="anak10thn/pocket-tts-indonesian",
        filename="onnx/"+item,revision=rev)
    shutil.copyfile(source,Path(os.environ["BUNDLE_MODELS"])/item)
    print("BUNDLE_MODEL_ADDED",item,flush=True)
ref=hf_hub_download(repo_id="Eempostor/F5-TTS-INDO-FINETUNE-V2",
    filename="ref_reporter.mp3")
shutil.copyfile(ref,Path(os.environ["BUNDLE_VOICES"])/"ref_reporter.mp3")
print("BUNDLE_VOICE=PUBLIC_REPORTER_REFERENCE",flush=True)
PY
cat > "$TMP/bundle/ATTRIBUTION.txt" <<'TXT'
Pocket Indonesian ONNX weights: https://huggingface.co/anak10thn/pocket-tts-indonesian
Model revision: 382fe85ca848546efb04bf1b7fdba78c6396e2ce
Model license: CC-BY-4.0
Native runtime MIT: https://github.com/netai369/PocketTTS.cpp-multilingual
Native revision: 3ed176a2b238b7ddb62b4aea4e7469ae4bcc3489
Public reporter sample: https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2
For noncommercial staging of synthetic Indonesian Call voice; check reference speaker usage rights.
TXT
chmod 755 "$TMP/bundle/pocket-tts"
mkdir -p "$ROOT/diza-live/pocket-vercel/.out"
tar -czf "$ROOT/diza-live/pocket-vercel/.out/pocket-cpu-id-v1.tar.gz" -C "$TMP/bundle" .
test "$(stat -c%s "$ROOT/diza-live/pocket-vercel/.out/pocket-cpu-id-v1.tar.gz")" -gt 10000000
echo "VOICE_RELEASE_BUNDLE_MB=$(du -m "$ROOT/diza-live/pocket-vercel/.out/pocket-cpu-id-v1.tar.gz"|cut -f1)"
echo "VOICE_RELEASE_UNPACK_MB=$(du -sm "$TMP/bundle"|cut -f1)"
echo "VOICE_RELEASE_BUILD=PASS"
