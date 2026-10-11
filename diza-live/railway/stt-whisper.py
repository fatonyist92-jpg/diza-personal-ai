#!/usr/bin/env python3
"""Private Indonesian speech recognition with multilingual Whisper base CPU.
Preserves word onsets by padding silence and never cropping VAD timestamps.
Audio stays transient, and only the recognized words go back to the owner.
"""
import sys
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from faster_whisper.vad import get_speech_timestamps, VadOptions

MODEL_DIR = "/opt/diza-live/models/whisper-base"
SAMPLE_RATE = 16000

def main() -> None:
    if len(sys.argv) != 2:
        raise ValueError("Expected one temporary audio path")
    audio = decode_audio(sys.argv[1], sampling_rate=SAMPLE_RATE)
    if len(audio) < int(SAMPLE_RATE * 0.28):
        print("")
        return

    # Separate Voice Activity DETECTION from audio cropping: prior Silero
    # vad_filter removed the brief initial 'tes' from 'tes satu dua tiga'.
    # We use VAD solely to reject completely silent clips, never to remove
    # syllables or word onsets before Whisper decoding.
    moments = get_speech_timestamps(
        audio,
        VadOptions(threshold=0.36, min_speech_duration_ms=120,
                   min_silence_duration_ms=370, speech_pad_ms=360),
    )
    if not moments:
        print("")
        return
    # Leading padding helps capture consonants when Chrome clips the first
    # milliseconds. No external audio sent and no language translation.
    padded = np.pad(audio, (int(0.42 * SAMPLE_RATE), int(0.28 * SAMPLE_RATE)))
    model = WhisperModel(
        MODEL_DIR, device="cpu", compute_type="int8",
        cpu_threads=2, num_workers=1,
    )
    segments, _ = model.transcribe(
        padded,
        language="id",
        task="transcribe",
        beam_size=5,
        best_of=5,
        patience=1.2,
        temperature=0,
        condition_on_previous_text=False,
        vad_filter=False,
        no_speech_threshold=0.58,
        log_prob_threshold=-1.0,
        compression_ratio_threshold=2.2,
    )
    accepted = []
    for part in segments:
        text = part.text.strip()
        if not text:
            continue
        if part.avg_logprob < -0.9:
            continue
        if part.no_speech_prob > 0.75 and part.avg_logprob < -0.4:
            continue
        accepted.append(text)
    sys.stdout.write(" ".join(accepted).strip()[:1800] + "\n")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Local Indonesian STT unavailable", file=sys.stderr)
        sys.exit(2)
