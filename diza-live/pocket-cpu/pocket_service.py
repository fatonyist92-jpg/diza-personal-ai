"""Isolated CPU Indonesian voice-clone worker for the existing /v1/tts contract.

LAB ONLY. The worker is not deployed or wired to Railway.
Use the approved public female reporter reference for evaluation.
No private or user microphone recordings are saved or downloaded.
"""
import asyncio
import hmac
import io
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

POCKET_CONFIG = os.getenv(
    "POCKET_MODEL_CONFIG",
    "hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@17257664e384561c957b02ac92edd1a24807f0e5",
)
VOICE_TOKEN = os.getenv("POCKET_VOICE_TOKEN", "").strip()
REFERENCE_WAV = Path(os.getenv("POCKET_REFERENCE_WAV", "/models/ref_reporter_48k_mono.wav"))
MAX_SPEECH_CHARS = 1200
MAX_AUDIO_S = 24
MAX_WAV_BYTES = 9_000_000
MODEL = None
VOICE_STATE = None
BUSY = asyncio.Lock()


class VoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=MAX_SPEECH_CHARS)
    language: str = "id"
    voice: str = "female"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global MODEL, VOICE_STATE
    if len(VOICE_TOKEN) < 24:
        raise RuntimeError("POCKET_VOICE_TOKEN missing or too short")
    if not REFERENCE_WAV.is_file():
        raise RuntimeError("Approved female reference WAV not found")
    import torch
    from pocket_tts import TTSModel
    torch.set_num_threads(max(1, min(os.cpu_count() or 2, 2)))
    MODEL = await asyncio.to_thread(TTSModel.load_model, config=POCKET_CONFIG, eos_threshold=-6.0)
    VOICE_STATE = await asyncio.to_thread(MODEL.get_state_for_audio_prompt, str(REFERENCE_WAV))
    try:
        yield
    finally:
        MODEL = None
        VOICE_STATE = None


app = FastAPI(
    title="Bloks Pocket Indonesian CPU Voice [staging only]",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
async def health():
    return {"ready": MODEL is not None and VOICE_STATE is not None, "busy": BUSY.locked()}


def _render(text: str) -> bytes:
    # Pocket TTS manages its own torch inference state; never wrap this in an
    # additional torch.inference_mode() context (tested to break generation).
    audio = MODEL.generate_audio(VOICE_STATE, text)
    arr = np.asarray(audio.detach().cpu().numpy(), dtype=np.float32).reshape(-1)
    duration = len(arr) / MODEL.sample_rate
    if not np.isfinite(arr).all() or duration < 0.4 or duration > MAX_AUDIO_S:
        raise ValueError("Invalid rendered waveform")
    sink = io.BytesIO()
    sf.write(sink, arr, MODEL.sample_rate, format="WAV", subtype="PCM_16")
    wav = sink.getvalue()
    if not 1024 <= len(wav) <= MAX_WAV_BYTES:
        raise ValueError("Invalid WAV size")
    return wav


@app.post("/v1/tts", response_class=Response)
async def tts(payload: VoiceRequest, authorization: str | None = Header(default=None)):
    if len(VOICE_TOKEN) < 24 or not hmac.compare_digest(
        authorization or "", "Bearer " + VOICE_TOKEN
    ):
        raise HTTPException(status_code=401, detail="Not authorized")
    if payload.language != "id" or payload.voice != "female":
        raise HTTPException(status_code=422, detail="Unsupported language or voice")
    if MODEL is None or VOICE_STATE is None:
        raise HTTPException(status_code=503, detail="CPU voice not ready")
    if BUSY.locked():
        raise HTTPException(status_code=503, detail="CPU voice busy")
    spoken = payload.text.strip()
    if not spoken:
        raise HTTPException(status_code=422, detail="Empty speech")
    async with BUSY:
        started = time.monotonic()
        try:
            wav = await asyncio.to_thread(_render, spoken)
        except Exception:
            # Never log users' speech or expose server/model tracebacks.
            raise HTTPException(status_code=503, detail="CPU synthesis unavailable")
        print("POCKET_CPU_WAV_OK duration_ms=", round((time.monotonic()-started)*1000), flush=True)
    return Response(
        content=wav,
        media_type="audio/wav",
        headers={"cache-control": "no-store", "x-content-type-options": "nosniff"},
    )
