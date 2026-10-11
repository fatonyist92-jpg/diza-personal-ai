#!/usr/bin/env python3
"""Indonesian speech recognition with a fully local tiny Whisper CPU model.
Reads one ephemeral audio file and prints ONLY its transcript to stdout.
No external STT API, no model downloads at request time, no raw audio logs.
"""
import sys
from faster_whisper import WhisperModel

MODEL_DIR = "/opt/diza-live/models/whisper-tiny"

def main():
    if len(sys.argv) != 2:
        raise ValueError("Expected a single temporary audio path")
    model = WhisperModel(MODEL_DIR, device="cpu", compute_type="int8", cpu_threads=2, num_workers=1)
    segments, _ = model.transcribe(
        sys.argv[1],
        language="id",
        beam_size=2,
        best_of=2,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        no_speech_threshold=0.6,
    )
    text = " ".join(part.text.strip() for part in segments).strip()[:1800]
    sys.stdout.write(text + "\n")
    sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never echo contents of a user recording or environment secrets.
        sys.stderr.write("Local Indonesian speech recognizer failed\n")
        sys.exit(2)
