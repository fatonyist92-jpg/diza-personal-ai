#!/usr/bin/env python3
"""Benchmark the user's already-installed F5 Indo V2 model in Google Colab.
One Python worker process; F5 model and Vocos loaded exactly once.
No web server, no inbound tunnel, no Railway/Bloks production change.
Designed for Python 3.11 F5 venv from Bloks_F5_Indonesia_Colab_Google_AI_Pro.ipynb.
"""
import os
os.environ["MPLBACKEND"] = "Agg"
os.environ["PYTHONUNBUFFERED"] = "1"
import pathlib
import sys
import time
import traceback

ROOT = pathlib.Path("/content/bloks_f5_indonesia")
MODELS = ROOT / "model_id"
AUDIO = ROOT / "audio"
AUDIO.mkdir(parents=True, exist_ok=True)
CKPT = MODELS / "f5_tts_indo_v2.pt"
VOCAB = MODELS / "vocab.txt"
REFERENCE = MODELS / "ref_reporter.mp3"
REF_TEXT = "dikatakan ternyata cek 3 miliar yang diberikan untuk mahar pernikahan ini adalah palsu."

# First sentence in exactly the same F5 female voice, then two other prompt styles.
# Keep quality baseline (32 NFE) and compare faster 16 and 8 NFE.
TESTS = (
    ("santai_32", "Halo, aku Diza. Gimana kabar kamu hari ini?", 32),
    ("santai_16", "Halo, aku Diza. Gimana kabar kamu hari ini?", 16),
    ("santai_8", "Halo, aku Diza. Gimana kabar kamu hari ini?", 8),
    ("teknis_16", "Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar.", 16),
    ("hangat_16", "Tenang, ceritain saja. Kita cari solusinya bareng-bareng.", 16),
)

def log(*args):
    print(*args, flush=True)

def main():
    missing = [str(x) for x in (CKPT, VOCAB, REFERENCE) if not x.is_file()]
    if missing:
        log("ERROR: model belum tersedia di SESI COLAB INI:", missing)
        log("Jalankan dahulu sel 1 sampai 4 notebook Colab sebelumnya, JANGAN sel 5 CLI.")
        return 2
    import torch
    import numpy as np
    import soundfile as sf
    from f5_tts.api import F5TTS
    if not torch.cuda.is_available():
        log("ERROR: GPU Colab tidak aktif. Runtime > Change runtime type > T4 GPU.")
        return 3
    log("GPU:", torch.cuda.get_device_name(0))
    log("CHECKPOINT:", CKPT.stat().st_size // 1_000_000, "MB")
    log("Memuat F5 Indo V2 & Vocos SEKALI SAJA...")
    start_load = time.monotonic()
    engine = F5TTS(
        model="F5TTS_v1_Base",
        ckpt_file=str(CKPT),
        vocab_file=str(VOCAB),
        device="cuda",
    )
    torch.cuda.synchronize()
    loading_seconds = time.monotonic() - start_load
    log(f"MODEL_READY load={loading_seconds:.2f}s (hanya sekali)")
    results = []
    for label, text, nfe in TESTS:
        out = AUDIO / f"F5_PERSISTENT_{label}.wav"
        if out.exists():
            out.unlink()
        log(f"\nMULAI {label} NFE={nfe}: {text}")
        torch.cuda.synchronize()
        t0 = time.monotonic()
        try:
            with torch.inference_mode():
                samples, rate, _spec = engine.infer(
                    ref_file=str(REFERENCE),
                    ref_text=REF_TEXT,
                    gen_text=text,
                    nfe_step=nfe,
                    speed=1.0,
                    file_wave=None,
                    show_info=lambda *a, **kw: None,
                    progress=None,  # F5 utils expect module.progress.tqdm, not tqdm.auto class/callable.
                )
            torch.cuda.synchronize()
            generation_seconds = time.monotonic() - t0
            samples = np.asarray(samples,dtype=np.float32).reshape(-1)
            seconds = len(samples) / rate
            if (not np.isfinite(samples).all() or
                    not (0.5 < seconds < 24) or
                    not (1000 < len(samples))):
                raise RuntimeError("Audio invalid, inspect output before publishing")
            sf.write(out,samples,rate,subtype="PCM_16")
            ratio = generation_seconds / seconds
            memory_mb = torch.cuda.max_memory_allocated(0) / 2**20
            log(
                f"PASS {label}: wav={seconds:.2f}s "
                f"generate={generation_seconds:.2f}s "
                f"RTF={ratio:.2f} VRAM_PEAK={memory_mb:.0f}MiB "
                f"file={out}"
            )
            results.append((label,nfe,round(generation_seconds,2),round(seconds,2),round(ratio,2),str(out)))
        except Exception as exc:
            log(f"FAIL {label}: {type(exc).__name__}: {str(exc)[:300]}")
            traceback.print_exc(limit=2)
            results.append((label,nfe,None,None,None,"ERROR"))
    log("\n=== RINGKASAN F5 PERSISTENT GPU ===")
    log("startup_model_seconds:", round(loading_seconds,2))
    for label,nfe,elapsed,duration,ratio,where in results:
        log(f"{label}: NFE={nfe} | generate={elapsed}s | audio={duration}s | RTF={ratio} | {where}")
    log("RTF <1 berarti model mampu menghasilkan audio lebih cepat daripada durasi audio; latensi Call masih mencakup jaringan/STT/LLM.")
    log("Penting: belum membuat endpoint Call Bloks; jangan gunakan Colab sebagai server permanen/tunnel.")
    return 0 if all(item[2] is not None for item in results) else 1

if __name__ == "__main__":
    sys.exit(main())
