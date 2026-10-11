#!/usr/bin/env python3
"""Private Indonesian STT with multilingual Whisper BASE, CPU int8.
Only the transcript is returned; nothing is logged or uploaded. Unsupported
or low-confidence audio returns an empty string, not invented instructions.
"""
import sys
from faster_whisper import WhisperModel

MODEL_DIR = "/opt/diza-live/models/whisper-base"

def main() -> None:
    if len(sys.argv) != 2:
        raise ValueError("Expected single temporary audio path")
    model = WhisperModel(
        MODEL_DIR, device="cpu", compute_type="int8",
        cpu_threads=2, num_workers=1,
    )
    segments, _ = model.transcribe(
        sys.argv[1],
        language="id",
        task="transcribe",
        beam_size=5,
        best_of=5,
        patience=1.2,
        temperature=0,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={
            "threshold": 0.48,
            "min_speech_duration_ms": 180,
            "min_silence_duration_ms": 350,
            "speech_pad_ms": 220,
        },
        no_speech_threshold=0.58,
        log_prob_threshold=-0.95,
        compression_ratio_threshold=2.2,
        repetition_penalty=1.1,
    )
    accepted = []
    for part in segments:
        words = part.text.strip()
        if not words:
            continue
        # Weak model output and silence hallucinations must not become
        # commands/actions for the agent.
        if part.avg_logprob < -0.9:
            continue
        if part.no_speech_prob > 0.75 and part.avg_logprob < -0.4:
            continue
        accepted.append(words)
    text = " ".join(accepted).strip()[:1800]
    sys.stdout.write(text + "\n")
    sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Local Indonesian STT unavailable", file=sys.stderr)
        sys.exit(2)
