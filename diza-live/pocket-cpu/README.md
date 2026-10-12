# Bloks Pocket Indonesian CPU Voice — isolated Call staging (2026-10-12)

**User-selected candidate:** Pocket TTS Indonesian 6-layer, using the same public `ref_reporter.mp3` used to evaluate F5 Indo V2 female speech. This is a speaker-conditioning reference, **not a guarantee of identical F5 voice**.

**Production safety:** Nothing in `main`, `diza-live/railway`, Railway deployment, Bloks UI, Call state machine, Muse, Codex, STT, secret variables or DIZA v19 is changed by this staging prototype. No live call routing has been switched.

## Evidence
Actual 4-core hosted CPU generation with public voice reference, 2026-10-12:
- Indonesian conversational phrase: 0.588 s synthesis / 1.28 s resulting audio.
- Indonesian technical phrase: 1.344 s synthesis / 3.36 s resulting audio.
- 2/2 PASS, GitHub Actions: https://github.com/fatonyist92-jpg/diza-personal-ai/actions/runs/38200829435

These measurements exclude model cold boot, voice conditioning at startup, LLM/STT/network and audio playback. This model did **not** use the exact F5 `speed=0.85` control: native speed only. Acoustic quality must be checked by the user listening to WAVs.

## Staging API
`pocket_service.py` mirrors the existing authenticated `POST /v1/tts` contract:
- HTTP Authorization: `Bearer <POCKET_VOICE_TOKEN>` (at least 24 chars; only configure securely on the host).
- JSON: `{"text":"Halo, aku Diza.","language":"id","voice":"female"}`
- WAV response, `Cache-Control: no-store`.
- `GET /health` shows model warm-up and busy state.
- Models are initialized once at process startup and requests are single-flight for CPU/RAM safety.
- Never auto-fallback to device/robot voice. An unavailable CPU worker returns 503.
- Guardrails: token validation, max 1200 characters, 24s audio, 9MB WAV.

Environment: `POCKET_VOICE_TOKEN`, `POCKET_REFERENCE_WAV`, optional `POCKET_MODEL_CONFIG`.

Provisioning requires Python 3.11, CPU-only PyTorch and Pocket-TTS 3.1.0, FFmpeg for conversion of the approved reporter reference to mono WAV, FastAPI, Uvicorn, numpy, soundfile. The initial public reference is from HF repository `Eempostor/F5-TTS-INDO-FINETUNE-V2` and Pocket config is `hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@17257664e384561c957b02ac92edd1a24807f0e5`. Respect all model and voice licenses before wider or commercial release.

The existing Bloks `f5-remote-tts.mjs` can inform a separate opt-in **Pocket** client because the JSON/WAV contract matches, but that existing module has GPU-specific messages and is not silently reused or modified. A real persistent CPU host and HTTPS reverse proxy are required before end-to-end Call evaluation; GitHub Actions and Codespaces cannot be assumed to be always-on free production servers.

**Acceptance before live integration:** authenticated HTTPS; warmed model; median response onset below 2s end-to-end; clean Indonesian pronunciation; voice and speaking pace approved by user; interrupted/canceled calls behave; persistent CPU availability; no unapproved charges. If these gates fail, keep the existing live voice untouched.
