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
import numpy as np
import soundfile as sf
import os
path=Path(os.environ["OUT"])/"pocket_native_santai.wav"
audio,sr=sf.read(str(path),dtype="float32")
duration=len(audio)/sr
assert np.isfinite(audio).all() and np.max(np.abs(audio)) > 0.001
assert 0.5 < duration < 25
print(f"NATIVE_AUDIO_VALID duration_s={duration:.3f} samplerate={sr} bytes={path.stat().st_size}",flush=True)
# Native engine emits IEEE-float WAV (type 3), which Python's stdlib
# wave module does not parse. Convert the audition artifact to PCM16 WAV,
# compatible with the existing Bloks Call voice transport.
sf.write(str(path),audio,sr,format="WAV",subtype="PCM_16")
print("NATIVE_AUDIO_PCM16=PASS",flush=True)
PY


echo "NATIVE_HTTP_STAGE=start isolated native C++ model and protected PCM16 gateway"
export POCKET_NATIVE_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(42))')"
"$BIN" --server --port 8080 --models-dir "$WORK/models" --voices-dir "$WORK/voices" --tokenizer "$WORK/models/tokenizer.model" --threads 2 --eos-threshold -6.0 > "$WORK/native-http.log" 2>&1 &
native_pid=$!
node "$OUT/../native-auth-proxy.mjs" > "$WORK/native-proxy.log" 2>&1 &
proxy_pid=$!
trap 'kill "$proxy_pid" "$native_pid" 2>/dev/null || true' EXIT
if ! node "$OUT/../native-real-http-smoke.mjs"; then
  echo "NATIVE_HTTP_STAGE=FAIL (showing non-sensitive startup diagnostics)"
  tail -30 "$WORK/native-http.log" || true
  tail -30 "$WORK/native-proxy.log" || true
  exit 1
fi
echo "NATIVE_HTTP_STAGE=PASS"
