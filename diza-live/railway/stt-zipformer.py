#!/usr/bin/env python3
"""Indonesian STT via Sherpa-ONNX Zipformer2 (NOT Whisper).
All transcription runs on Railway in CPU int8 mode. Audio is decoded locally.
No provider keys, remote inference, persisted recordings, or user transcripts in logs.
"""
import os
import subprocess
import sys

import numpy as np
import sherpa_onnx

MODEL = "/opt/diza-live/models/sherpa-id"
ENCODER = "encoder-iter-100000-avg-15-chunk-32-left-256.int8.onnx"
DECODER = "decoder-iter-100000-avg-15-chunk-32-left-256.int8.onnx"
JOINER = "joiner-iter-100000-avg-15-chunk-32-left-256.int8.onnx"
SAMPLE_RATE = 16000
MAX_BYTES = 2_000_000  # at most ~31 seconds at 16kHz float32

def decode(path: str) -> np.ndarray:
    # The browser can upload WebM/Opus, MP4, Ogg or WAV.
    # Use the pinned system ffmpeg to decode to normalized 16kHz mono floats.
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-i", path, "-t", "20", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
         "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"],
        capture_output=True,
        check=True,
        timeout=18,
    ).stdout
    if not 1_600 <= len(raw) <= MAX_BYTES:
        return np.empty(0, dtype=np.float32)
    return np.frombuffer(raw, dtype=np.float32)

def main() -> None:
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        raise ValueError("expected one temporary audio file")
    samples = decode(sys.argv[1])
    if len(samples) < SAMPLE_RATE // 4:
        print("")
        return

    recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=os.path.join(MODEL, "tokens.txt"),
        encoder=os.path.join(MODEL, ENCODER),
        decoder=os.path.join(MODEL, DECODER),
        joiner=os.path.join(MODEL, JOINER),
        model_type="zipformer2",
        num_threads=2,
        sample_rate=SAMPLE_RATE,
        decoding_method="greedy_search",
        enable_endpoint_detection=False,
        provider="cpu",
    )
    stream = recognizer.create_stream()
    # Streaming transducers need a little context before a clipped first
    # consonant. Never trim audio; prepend 400ms silence and keep the tail.
    stream.accept_waveform(SAMPLE_RATE, np.zeros(int(SAMPLE_RATE * 0.4), dtype=np.float32))
    stream.accept_waveform(SAMPLE_RATE, samples)
    stream.accept_waveform(SAMPLE_RATE, np.zeros(SAMPLE_RATE // 2, dtype=np.float32))
    stream.input_finished()
    decoded = 0
    while recognizer.is_ready(stream):
        recognizer.decode_stream(stream)
        decoded += 1
        if decoded > 5000:
            raise RuntimeError("too many decoding steps")
    # Zipformer2 returns text with either spaces or subword tokens.
    result = recognizer.get_result_all(stream)
    text = str(result.text if hasattr(result, "text") else result).strip()
    sys.stdout.write(text[:1800] + "\n")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Diagnostics are ONLY enabled for fixed synthetic tests, never for
        # actual microphone recordings or API requests.
        if os.environ.get("STT_SYNTHETIC_TEST") == "1":
            print("SHERPA_TEST_ERROR=" + type(exc).__name__ + ":" + str(exc)[:240], file=sys.stderr)
        else:
            print("Local Zipformer STT unavailable", file=sys.stderr)
        sys.exit(2)
