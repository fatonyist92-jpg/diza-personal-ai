# Bloks F5 Indonesian female voice: integration staging only

**State: NOT DEPLOYED.** Only the isolated GitHub branch is modified.
Bloks live on Railway still uses previous Supertonic option for the existing Gadis
Neural selection. No change to main, DIZA v19, locked UI, Codex, Muse Spark,
Gemini STT, login, persistent Railway volume, or Gemini Aoede fallback snapshot.

## Why staged rather than directly linked to Kaggle
The user has approved the sound of three generated Kaggle F5-TTS Indonesian V2
female samples. This is a voice-quality audition, not a functioning remote
real-time voice API. Kaggle Notebook sessions do **not** provide an officially
stable inbound HTTPS speech endpoint or an on-demand API for interactive
GPU sessions. Kaggle's acceptable use policy disallows server farming and
some tunnel methods have caused sessions to be canceled. Do not deploy
Cloudflare Tunnel, Ngrok, Gradio Share/FRP or other persistent serve tricks on
Kaggle without obtaining explicit platform approval.

This project provides a clean HTTPS GPU speech contract for an *authorized*
GPU-hosting platform, preserving Kaggle as a private model-quality lab.
No provider registration/payment or Railway deployment happens here.

## HTTP interface (ready in staging)
- `POST https://<AUTHORIZED_GPU_HOST>/v1/tts`
- Header: `Authorization: Bearer <at-least-24-char-private-token>`
- Content-Type: `application/json`
- Request: `{"text":"Halo, aku Diza.","language":"id","voice":"female"}`
- Response: `audio/wav`, a real RIFF/WAVE 16-bit PCM file
- Optional `GET /health` displays only ready/busy state.

GPU implementation: `diza-live/f5-gpu/f5_gpu_service.py` (FastAPI), using
`f5_tts.api.F5TTS(model="F5TTS_v1_Base",ckpt_file=...,vocab_file=...,device="cuda")`,
and the user-approved demo's `ref_reporter.mp3` + exact reference transcript.
Startup must preload F5 checkpoint into GPU; MAX 1 concurrent synthesis.
Inputs and audio stay in memory, not on persistent storage. Responses have
size and duration limits. **Do not log spoken text, bearer token, or private
voice data.** Run with HTTPS provided by your authenticated gateway.
This code is not yet E2E benchmarked on a GPU host.

### Authorized GPU host prerequisites
- Python 3.11, CUDA with sufficient GPU memory, Pytorch, soundfile,
  FastAPI, uvicorn, pinned compatible `f5-tts` dependencies.
- Download the approved CC-BY-NC-4.0 model legally with creator attribution:
  `Eempostor/F5-TTS-INDO-FINETUNE-V2/f5_tts_indo_v2.pt`,
  `vocab.txt`, `ref_reporter.mp3`.
- Supply these variables in the **private server environment**, never in repo:
  `F5_CHECKPOINT`, `F5_VOCAB`, `F5_REFERENCE_WAV`,
  `F5_REFERENCE_TEXT` (the exact text from model card),
  `F5_VOICE_TOKEN` (24+ random characters).
- Start via `uvicorn f5_gpu_service:app --host 0.0.0.0 --port 8080 --no-access-log`,
  placed behind a secure HTTPS gateway. Add host-level rate limiting and
  request-level authentication before exposing publicly.
- Model license is non-commercial: do **not** sell or offer it commercially.

### Railway side
When and **only when** a verified authorized HTTPS GPU endpoint is ready,
privately configure:

```
F5_REMOTE_TTS_ENABLED=1
F5_REMOTE_TTS_URL=https://AUTHORIZED_GPU_HOST/v1/tts
F5_REMOTE_TTS_TOKEN=<same-private-token-as-F5_VOICE_TOKEN>
SUPERTONIC3_TTS_ENABLED=0
```

Never put keys into GitHub; changing these requires the user's explicit
permission and live integration smoke testing. The F5 provider takes precedence
for the existing `id-ID-GadisNeural` backend voice selection ONLY if enabled,
and fails closed if GPU is sleeping (no robotic/foreign-accent fallback).
The browser uses existing authenticated /speak endpoint, unchanged UI; user
data and agent engines remain separate.

### Testing / acceptance
1. Isolated Node provider test (mock GPU, verifies HTTPS, auth, WAV,
   rejection/timeout handling, max response size and concurrency).
2. GitHub Actions builds full pinned Bloks Docker + patch, no deployment.
3. Explicit GPU test with authorized host: health, female voice audio,
   3 native-listening samples, cold/warm latency, VRAM, repeat after idle,
   GPU sleep/wake, successful Call with real phone mic and Codex agent,
   interrupt/hang up, error handling, persistence after Railway refresh.
4. Never merge/deploy if any model quality, auth, budget or host policy check fails.

References:
- https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/README.md
- https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2
- https://www.kaggle.com/aup
