#!/usr/bin/env python3
"""Benchmark user-approved Indonesian female F5 voice on Codespaces CPU.
Not a web server, tunnel, or Railway production change.
"""
import os
os.environ["MPLBACKEND"] = "Agg"
os.environ["CUDA_VISIBLE_DEVICES"] = ""
import pathlib
import time
import traceback
import numpy as np
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download
from f5_tts.api import F5TTS

REPO = "Eempostor/F5-TTS-INDO-FINETUNE-V2"
ROOT = pathlib.Path(__file__).resolve().parent
ART = ROOT / "models"
OUT = ROOT / "outputs"
ART.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
REF_TEXT = "dikatakan ternyata cek 3 miliar yang diberikan untuk mahar pernikahan ini adalah palsu."

def log(*args):
    print(*args, flush=True)

def main():
    # Hugging Face checkpoint is CC-BY-NC-4.0 (non-commercial).
    log("CHECK: CPU:", os.cpu_count(), "RAM available via /proc/meminfo; no GPU needed.")
    torch.set_num_threads(max(1, min(os.cpu_count() or 2, 4)))
    sources = {}
    for filename in ("f5_tts_indo_v2.pt", "vocab.txt", "ref_reporter.mp3"):
        log("Preparing:", filename)
        sources[filename] = hf_hub_download(repo_id=REPO, filename=filename, local_dir=str(ART))
    ckpt = pathlib.Path(sources["f5_tts_indo_v2.pt"])
    if ckpt.stat().st_size < 1_000_000_000:
        raise RuntimeError("Checkpoint incomplete; expected approx 1.35GB.")
    log("Loading F5/Vocos model ONCE on CPU...")
    t0 = time.monotonic()
    engine = F5TTS(model="F5TTS_v1_Base", ckpt_file=str(ckpt),
                   vocab_file=sources["vocab.txt"], device="cpu")
    log(f"MODEL_READY cpu_load={time.monotonic()-t0:.2f}s")
    tests = [
        ("santai_085", "Halo, aku Diza. Gimana kabar kamu hari ini?"),
        ("teknis_085", "Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar."),
    ]
    passed = 0
    for label, sentence in tests:
        log("START", label, "nfe=16 tempo=0.85")
        tic = time.monotonic()
        try:
            with torch.inference_mode():
                wav, sr, _ = engine.infer(
                    ref_file=sources["ref_reporter.mp3"], ref_text=REF_TEXT,
                    gen_text=sentence, nfe_step=16, speed=0.85,
                    show_info=lambda *_a, **_kw: None,
                    progress=None, file_wave=None,
                )
            generate_s = time.monotonic()-tic
            audio = np.asarray(wav, dtype=np.float32).reshape(-1)
            duration_s = len(audio)/sr
            if not np.isfinite(audio).all() or not (0.5 < duration_s < 25):
                raise RuntimeError("Invalid synthesized output")
            saved = OUT / f"F5_CPU_{label}.wav"
            sf.write(str(saved), audio, sr, subtype="PCM_16")
            log(f"PASS {label}: generate={generate_s:.2f}s audio={duration_s:.2f}s "
                f"RTF={generate_s/duration_s:.3f} output={saved}")
            passed += 1
        except Exception as exc:
            log("FAIL", label, type(exc).__name__, str(exc))
            traceback.print_exc(limit=5)
    log(f"RESULT: {passed}/{len(tests)} passed")
    log("RTF<1 means synthesis faster than audio duration. This excludes network, STT and LLM.")
    log("Codespaces is a development environment that stops on inactivity, NOT a 24/7 voice server.")
    return 0 if passed == len(tests) else 1

if __name__ == "__main__":
    raise SystemExit(main())
