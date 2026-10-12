#!/usr/bin/env bash
# Pinned C++/ONNX prototype, CI only, no production deployment.
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK="$PWD/diza-live/pocket-native-lab/.work"
OUT="$PWD/diza-live/pocket-native-lab/outputs"
mkdir -p "$WORK" "$OUT"
export HF_HUB_DISABLE_TELEMETRY=1

echo "NATIVE_SETUP=fetch pinned multilingual source"
if [[ ! -d "$WORK/native-src/.git" ]]; then
  git clone -q https://github.com/netai369/PocketTTS.cpp-multilingual.git "$WORK/native-src"
fi
git -C "$WORK/native-src" checkout -q 3ed176a2b238b7ddb62b4aea4e7469ae4bcc3489
echo "NATIVE_SOURCE_SHA=$(git -C "$WORK/native-src" rev-parse HEAD)"

echo "NATIVE_SETUP=fetch published Indonesian ONNX INT8 model"
export WORK OUT
python - <<'PY'
import os,shutil
from pathlib import Path
from huggingface_hub import hf_hub_download,HfApi
root=Path(os.environ["WORK"])
models=root/"models"
voices=root/"voices"
models.mkdir(exist_ok=True,parents=True)
voices.mkdir(exist_ok=True,parents=True)
repo="anak10thn/pocket-tts-indonesian"
api=HfApi()
sha=api.model_info(repo).sha
print(f"INDONESIAN_MODEL_SHA={sha}",flush=True)
files=(
    "flow_lm_main_int8.onnx",
    "flow_lm_flow_int8.onnx",
    "mimi_decoder_int8.onnx",
    "mimi_encoder.onnx",
    "text_conditioner.onnx",
    "tokenizer.model",
    "bos_before_voice.npy",
    "bundle.json",
)
for item in files:
    source=hf_hub_download(repo_id=repo,filename="onnx/"+item,revision=sha)
    target=models/item
    shutil.copyfile(source,target)
    print(f"ONNX_READY {item} {target.stat().st_size/1024/1024:.1f} MiB",flush=True)
ref=hf_hub_download(repo_id="Eempostor/F5-TTS-INDO-FINETUNE-V2",filename="ref_reporter.mp3")
shutil.copyfile(ref,voices/"ref_reporter.mp3")
print("VOICE_REFERENCE=approved public reporter from F5 Indo V2",flush=True)
PY

echo "NATIVE_SETUP=build native C++ CPU engine"
python -m pip install --quiet 'cmake>=3.30,<5'
cmake -S "$WORK/native-src" -B "$WORK/native-build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$WORK/native-build" -j2
BIN="$WORK/native-src/pocket-tts"
test -x "$BIN"
# Source CMake ships a local ONNX Runtime shared object next to executable.
export LD_LIBRARY_PATH="$WORK/native-src:${LD_LIBRARY_PATH:-}"
echo "NATIVE_BUILD=PASS"
echo "NATIVE_BENCH_START"
cd "$WORK"
(/usr/bin/time -v "$BIN" --models-dir "$WORK/models" --voices-dir "$WORK/voices" --tokenizer "$WORK/models/tokenizer.model" --threads 2 --eos-threshold -6.0 --profile "Halo, aku Diza. Gimana kabar kamu hari ini?" "$WORK/voices/ref_reporter.mp3" "$OUT/pocket_native_santai.wav") 2>&1
echo "NATIVE_BENCH_DONE"
python - <<'PY'
from pathlib import Path
import wave,os
path=Path(os.environ["OUT"])/"pocket_native_santai.wav"
with wave.open(str(path),"rb") as f:
    duration=f.getnframes()/f.getframerate()
    print(f"NATIVE_AUDIO_VALID duration_s={duration:.3f} samplerate={f.getframerate()} bytes={path.stat().st_size}",flush=True)
    assert 0.5 < duration < 25
PY
