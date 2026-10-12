#!/usr/bin/env python3
"""Isolated one-time-load local Indonesian Zipformer service.
Keep audio only in the existing temporary directory. No transcripts are logged.
One line JSON protocol over child's private stdin/stdout (no network port).
"""
import importlib.util
import json
import os
import sys

import numpy as np
import sherpa_onnx

spec = importlib.util.spec_from_file_location(
    "stt_zipformer", "/opt/diza-live/stt-zipformer.py")
stt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stt)


def create_recognizer():
    return sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=os.path.join(stt.MODEL, "tokens.txt"),
        encoder=os.path.join(stt.MODEL, stt.ENCODER),
        decoder=os.path.join(stt.MODEL, stt.DECODER),
        joiner=os.path.join(stt.MODEL, stt.JOINER),
        model_type="zipformer2",
        num_threads=2,
        sample_rate=stt.SAMPLE_RATE,
        decoding_method="modified_beam_search",
        max_active_paths=4,
        enable_endpoint_detection=False,
        provider="cpu",
    )


def run_model(recognizer, path):
    samples = stt.decode(path)
    if len(samples) < stt.SAMPLE_RATE // 4:
        return ""
    stream = recognizer.create_stream()
    stream.accept_waveform(stt.SAMPLE_RATE, np.zeros(int(stt.SAMPLE_RATE * 0.5), dtype=np.float32))
    stream.accept_waveform(stt.SAMPLE_RATE, samples)
    stream.accept_waveform(stt.SAMPLE_RATE, np.zeros(int(stt.SAMPLE_RATE * 0.65), dtype=np.float32))
    stream.input_finished()
    for _ in range(5000):
        if not recognizer.is_ready(stream):
            break
        recognizer.decode_stream(stream)
    else:
        raise RuntimeError("decode step cap")
    result = recognizer.get_result_all(stream)
    return str(result.text if hasattr(result,"text") else result).strip()[:1800]


def respond(**args):
    sys.stdout.write(json.dumps(args, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    recognizer = create_recognizer()
    respond(ready=True)
    for raw in sys.stdin:
        try:
            item = json.loads(raw)
            path = item["path"]
            seq = item["id"]
            # Inherit the existing authenticated and temporary-audio route.
            if (not isinstance(seq, int) or not isinstance(path, str)
                or not path.startswith("/tmp/bloks-voice-")
                or not path.endswith("/speech.webm")
                or not os.path.isfile(path)):
                respond(id=seq if isinstance(seq, int) else -1, error="invalid temporary audio")
                continue
            text = run_model(recognizer,path)
            respond(id=seq,text=text)
        except Exception:
            # Never include user audio/transcripts or sensitive paths in logs.
            respond(id=item.get("id",-1) if isinstance(item,dict) else -1,error="local recognition failed")


if __name__=="__main__":
    main()
