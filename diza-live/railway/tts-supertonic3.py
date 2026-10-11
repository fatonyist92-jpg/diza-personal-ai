#!/usr/bin/env python3
"""Supertonic 3 INT8, Indonesian offline TTS. Reads text via stdin, WAV on stdout.
No API requests, no model downloads, no key and no user audio/text logs.
This is a bounded, single-request child process (isolated from Bloks server).
"""
import os
import sys
import wave
import io

# Avoid CPU saturation of the 2-vCPU Railway shared service.
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

def main():
    import numpy as np
    import sherpa_onnx

    text = sys.stdin.read(5500).strip()
    if not text or len(text) > 2500:
        raise ValueError("invalid speech input size")
    model_dir = "/opt/diza-live/models/supertonic3-id"
    filenames = {
        "duration_predictor": "duration_predictor.int8.onnx",
        "text_encoder": "text_encoder.int8.onnx",
        "vector_estimator": "vector_estimator.int8.onnx",
        "vocoder": "vocoder.int8.onnx",
        "tts_json": "tts.json",
        "unicode_indexer": "unicode_indexer.bin",
        "voice_style": "voice.bin",
    }
    paths = {key: os.path.join(model_dir, value) for key, value in filenames.items()}
    if not all(os.path.isfile(p) and os.path.getsize(p) > 0 for p in paths.values()):
        raise ValueError("missing offline TTS weights")
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            supertonic=sherpa_onnx.OfflineTtsSupertonicModelConfig(**paths),
            num_threads=2,
            debug=False,
            provider="cpu",
        )
    )
    tts = sherpa_onnx.OfflineTts(config)
    opts = sherpa_onnx.GenerationConfig()
    # Default F1 in production. 0..4 female presets only for controlled audition.
    sid = int(os.getenv("SUPERTONIC_FEMALE_SID", "0"))
    if sid not in (0, 1, 2, 3, 4):
        raise ValueError("invalid female voice preset")
    opts.sid = sid
    opts.num_steps = 8
    opts.speed = 1.04
    opts.extra["lang"] = "id"
    speech = tts.generate(text, opts)
    pcm = np.asarray(speech.samples, dtype=np.float32).reshape(-1)
    sample_rate = int(speech.sample_rate)
    if pcm.size < 800 or pcm.size > sample_rate * 130 or sample_rate not in (24000, 44100):
        raise RuntimeError("invalid offline TTS sample count")
    samples = (np.clip(pcm, -1.0, 1.0) * 32767).astype("<i2", copy=False)
    out = io.BytesIO()
    with wave.open(out, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(samples.tobytes())
    payload = out.getvalue()
    if len(payload) > 11_500_000:
        raise RuntimeError("offline TTS audio too large")
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Do not leak private text/paths in logs or user-visible errors.
        print("Offline Indonesian TTS unavailable", file=sys.stderr)
        sys.exit(2)
