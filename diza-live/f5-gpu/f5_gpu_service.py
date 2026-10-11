"""
Non-commercial F5-TTS Indo V2 GPU inference endpoint for a hosting platform that
explicitly supports always-running or on-demand HTTPS HTTP endpoints.
NOT a Kaggle notebook reverse-tunnel. Never deploy it without GPU permission,
owner authorization and an HTTPS gateway.
Install dependencies only in a clean Python 3.11 GPU image/venv.
"""
import asyncio
import hmac
import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

# Avoid notebook-specific interactive matplotlib backend leaking into GPU worker.
os.environ["MPLBACKEND"] = "Agg"

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

VOICE_TOKEN = os.getenv("F5_VOICE_TOKEN", "").strip()
CKPT = Path(os.getenv("F5_CHECKPOINT", "/models/f5_tts_indo_v2.pt"))
VOCAB = Path(os.getenv("F5_VOCAB", "/models/vocab.txt"))
REFERENCE = Path(os.getenv("F5_REFERENCE_WAV", "/models/ref_reporter.mp3"))
REF_TEXT = os.getenv("F5_REFERENCE_TEXT", "").strip()
MODEL = None
BUSY = asyncio.Lock()
MAX_AUDIO_SEC = 24
MAX_AUDIO_BYTES = 9_000_000


class VoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2400)
    language: str = "id"
    voice: str = "female"


def require_config():
    if len(VOICE_TOKEN) < 24:
        raise RuntimeError("F5_VOICE_TOKEN not configured")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU unavailable")
    if not REF_TEXT:
        raise RuntimeError("F5_REFERENCE_TEXT missing")
    for path in (CKPT, VOCAB, REFERENCE):
        if not path.is_file():
            raise RuntimeError("Required F5 artifact missing: " + path.name)


@asynccontextmanager
async def lifespan(app):
    global MODEL
    require_config()
    from f5_tts.api import F5TTS
    MODEL = await asyncio.to_thread(
        F5TTS, model="F5TTS_v1_Base", ckpt_file=str(CKPT),
        vocab_file=str(VOCAB), device="cuda"
    )
    try:
        yield
    finally:
        MODEL = None


app = FastAPI(title="Bloks F5 Indonesian Private Voice", lifespan=lifespan, docs_url=None,
              redoc_url=None, openapi_url=None)


@app.get("/health")
async def health():
    return {"ready": MODEL is not None and torch.cuda.is_available(), "busy": BUSY.locked()}


def _generate(text):
    wav, sample_rate, _spec = MODEL.infer(
        ref_file=str(REFERENCE), ref_text=REF_TEXT, gen_text=text,
        nfe_step=16, speed=1.0,
        show_info=lambda *_args, **_kwargs: None,
        progress=lambda iterable, **_kwargs: iterable,
        file_wave=None,
    )
    audio = np.asarray(wav, dtype=np.float32).reshape(-1)
    if not np.isfinite(audio).all() or audio.size < sample_rate // 2:
        raise RuntimeError("Invalid generated samples")
    seconds = audio.size / sample_rate
    if seconds > MAX_AUDIO_SEC:
        raise RuntimeError("Generated audio exceeded maximum duration")
    output = io.BytesIO()
    sf.write(output, audio, sample_rate, format="WAV", subtype="PCM_16")
    buf = output.getvalue()
    if not 1024 <= len(buf) <= MAX_AUDIO_BYTES:
        raise RuntimeError("Generated audio exceeded maximum size")
    return buf


@app.post("/v1/tts", response_class=Response)
async def synthesize(
    body: VoiceRequest, authorization: str | None = Header(default=None)
):
    expected = "Bearer " + VOICE_TOKEN
    if len(VOICE_TOKEN) < 24 or not hmac.compare_digest(
        authorization or "", expected
    ):
        raise HTTPException(status_code=401, detail="Not authorized")
    if MODEL is None:
        raise HTTPException(status_code=503, detail="GPU model warming")
    if body.language != "id" or body.voice != "female":
        raise HTTPException(status_code=422, detail="Unsupported language or voice")
    if BUSY.locked():
        raise HTTPException(status_code=503, detail="GPU voice occupied")
    async with BUSY:
        try:
            rendered = await asyncio.to_thread(_generate, body.text.strip())
        except Exception:
            # Never log private speech text or return implementation exceptions.
            raise HTTPException(status_code=503, detail="GPU synthesis unavailable")
    return Response(
        content=rendered,
        media_type="audio/wav",
        headers={"cache-control": "no-store", "x-content-type-options": "nosniff"},
    )
