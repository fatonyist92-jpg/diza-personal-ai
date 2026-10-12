# DIZA Live / Railway persistent Bloks Core (NOT the legacy DIZA v19 shell)
# Functional Source License FSL-1.1-MIT applies to official upstream Bloks.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates gosu python3 python3-venv ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10
# Neural voices use remote Edge read-aloud synthesis, not a heavy local model.
# Package installs at build time only. No Microsoft API key or billing.
RUN python3 -m venv /opt/diza-live/tts-venv \
 && /opt/diza-live/tts-venv/bin/pip install --no-cache-dir edge-tts==7.2.8
# Non-Whisper, native Indonesian Zipformer2 transducer with MIT weights.
# Download quantized model only during Docker build; never at runtime.
# Runtime memory and license footprint are far smaller than Whisper Small.
RUN python3 -m venv /opt/diza-live/stt-venv \
 && /opt/diza-live/stt-venv/bin/pip install --no-cache-dir sherpa-onnx==1.13.8 huggingface-hub==0.36.0 numpy==1.26.4 \
 && /opt/diza-live/stt-venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="spacewave/sherpa-onnx-streaming-zipformer2-id", revision="44e21d5e554a360c4ae0c3cdc57ec30811011ab6", local_dir="/opt/diza-live/models/sherpa-id", allow_patterns=["*.int8.onnx", "tokens.txt"])' \
 && test -s /opt/diza-live/models/sherpa-id/encoder-iter-100000-avg-15-chunk-32-left-256.int8.onnx \
 && test -s /opt/diza-live/models/sherpa-id/tokens.txt
# Optional quota-free Indonesian natural speech. The 145MB INT8 weights
# are baked into the Docker image; NEVER downloaded at runtime or to the
# persistent Railway volume. Reuses existing sherpa-onnx Python environment.
RUN /opt/diza-live/stt-venv/bin/python -c 'import sherpa_onnx; assert hasattr(sherpa_onnx, "OfflineTtsSupertonicModelConfig"), "need a sherpa-onnx with Supertonic3"; assert hasattr(sherpa_onnx, "GenerationConfig")' \
 && /opt/diza-live/stt-venv/bin/python -c 'from huggingface_hub import snapshot_download; snapshot_download(repo_id="csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11", revision="cca5a0e", local_dir="/opt/diza-live/models/supertonic3-id", allow_patterns=["*.int8.onnx", "tts.json", "unicode_indexer.bin", "voice.bin", "LICENSE"])' \
 && test -s /opt/diza-live/models/supertonic3-id/vector_estimator.int8.onnx \
 && test -s /opt/diza-live/models/supertonic3-id/voice.bin
COPY diza-live/railway/tts-supertonic3.py /opt/diza-live/tts-supertonic3.py
# Fail safely during build if Indonesian WAV cannot actually be synthesized.
RUN printf 'Halo, saya Diza. Suara Indonesia tanpa kuota API.' | /opt/diza-live/stt-venv/bin/python /opt/diza-live/tts-supertonic3.py > /tmp/supertonic3-smoke.wav \
 && /opt/diza-live/stt-venv/bin/python -c 'import wave; w=wave.open("/tmp/supertonic3-smoke.wav", "rb"); assert w.getnframes() > 1000; assert w.getnchannels()==1' \
 && rm -f /tmp/supertonic3-smoke.wav
WORKDIR /opt/bloks
RUN git init . \
 && git remote add origin https://github.com/hamedgitty/bloks.git \
 && git fetch --depth=1 origin ba36e7604e5c283bbebed4e4f99d3273f92ec0ec \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "ba36e7604e5c283bbebed4e4f99d3273f92ec0ec"
RUN pnpm install --frozen-lockfile
# Codex CLI is required by the upstream Bloks Codex app-server driver.
# Pin CLI to published stable versions, not alphas or an unbounded latest.
RUN npm install -g @openai/codex@0.162.1 && codex --version
# Native OpenCode ACP engine is already supported by upstream Bloks.
# Install its binary at image-build time (remote in-app installers are disabled).
RUN npm install -g opencode-ai@1.18.35 && opencode --version
# Keep the original Bloks React UI, add host-only secure browser pairing,
# and fail the build if any pinned upstream source anchor has changed.
COPY diza-live/railway/patch-webview.mjs /opt/diza-live/patch-webview.mjs
COPY diza-live/railway/patch-codex.mjs /opt/diza-live/patch-codex.mjs
# Opt-in official Meta Model API provider, no key and no auto-billing.
COPY diza-live/railway/patch-muse.mjs /opt/diza-live/patch-muse.mjs
COPY diza-live/railway/patch-neural-voice.mjs /opt/diza-live/patch-neural-voice.mjs
# Gemini TTS is strictly opt-in and uses the existing server-only Gemini API key.
COPY diza-live/railway/gemini-natural-tts.mjs /opt/bloks/server/gemini-natural-tts.mjs
COPY diza-live/railway/gemini-fast-stream.mjs /opt/bloks/server/gemini-fast-stream.mjs
COPY diza-live/railway/supertonic3-local-tts.mjs /opt/bloks/server/supertonic3-local-tts.mjs
COPY diza-live/railway/supertonic3-local-tts.test.mjs /opt/bloks/server/supertonic3-local-tts.test.mjs
RUN node --test /opt/bloks/server/supertonic3-local-tts.test.mjs
COPY diza-live/railway/gemini-fast-stream.test.mjs /opt/bloks/server/gemini-fast-stream.test.mjs
COPY diza-live/railway/pcmStreamAudio.ts /opt/bloks/src/lib/pcmStreamAudio.ts
COPY diza-live/railway/patch-fast-voice.mjs /opt/diza-live/patch-fast-voice.mjs
COPY diza-live/railway/gemini-natural-tts.test.mjs /opt/bloks/server/gemini-natural-tts.test.mjs
RUN node --test /opt/bloks/server/gemini-natural-tts.test.mjs
RUN node --test /opt/bloks/server/gemini-fast-stream.test.mjs
COPY diza-live/railway/patch-local-stt.mjs /opt/diza-live/patch-local-stt.mjs
COPY diza-live/railway/browser-stt.ts /opt/bloks/server/browser-stt.ts
COPY diza-live/railway/browserMic.ts /opt/bloks/src/lib/browserMic.ts
COPY diza-live/railway/callPlayback.ts /opt/bloks/src/lib/callPlayback.ts
COPY diza-live/railway/browserSpeechNative.ts /opt/bloks/src/lib/browserSpeechNative.ts
COPY diza-live/railway/patch-browser-speech.mjs /opt/diza-live/patch-browser-speech.mjs
COPY diza-live/railway/patch-mobile-model-picker.mjs /opt/diza-live/patch-mobile-model-picker.mjs
# Inject the Codex auth widget into upstream Bloks Engines panel before Vite build.
COPY diza-live/railway/CodexWebviewAuth.tsx /opt/bloks/src/components/CodexWebviewAuth.tsx
COPY diza-live/railway/codex-login.ts /opt/bloks/server/codex-login.ts
RUN node /opt/diza-live/patch-webview.mjs && node /opt/diza-live/patch-codex.mjs && node /opt/diza-live/patch-muse.mjs && node /opt/diza-live/patch-neural-voice.mjs && node /opt/diza-live/patch-browser-speech.mjs && node /opt/diza-live/patch-local-stt.mjs && node /opt/diza-live/patch-fast-voice.mjs && node /opt/diza-live/patch-mobile-model-picker.mjs && pnpm exec vite build
COPY diza-live/railway/web/ /opt/bloks/dist/
COPY diza-live/railway/entrypoint.sh /opt/diza-live/entrypoint.sh
COPY diza-live/railway/boot.mjs /opt/diza-live/boot.mjs
COPY diza-live/railway/tts-neural.py /opt/diza-live/tts-neural.py
COPY diza-live/railway/stt-zipformer.py /opt/diza-live/stt-zipformer.py
COPY diza-live/railway/stt-smoke.mjs /opt/diza-live/stt-smoke.mjs
COPY diza-live/railway/neural-smoke.mjs /opt/diza-live/neural-smoke.mjs
COPY diza-live/railway/muse-smoke.mjs /opt/diza-live/muse-smoke.mjs
COPY diza-live/railway/muse-acp-smoke.mjs /opt/diza-live/muse-acp-smoke.mjs
RUN chmod +x /opt/diza-live/entrypoint.sh \
 && mkdir -p /home/node/.bloks \
 && chown -R node:node /home/node /opt/bloks /opt/diza-live
ENV HOME=/home/node
ENV PORT=10000
ENV BLOKS_STATIC_DIR=/opt/bloks/dist
# Share auth safely across Railway redeploys; never add an API billing key.
ENV CODEX_HOME=/home/node/.bloks/codex
# Disable CLI self-updates during runtime; upgrade only through versioned Docker builds.
ENV OPENCODE_DISABLE_AUTOUPDATE=1
EXPOSE 10000
# Railway volumes are mounted root-owned. Start briefly as root, then
# drop privileges to node before the server handles any network request.
USER root
ENTRYPOINT ["/opt/diza-live/entrypoint.sh"]
