#!/usr/bin/env python3
"""Isolated Supertonic 3 CPU benchmark, *not* a replacement of F5 voice or Bloks production."""
import os
os.environ["OMP_NUM_THREADS"] = "4"
import sys
import time
import json
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "supertonic-archive" / "py"))
from helper import load_text_to_speech, load_voice_style

def main():
    model = ROOT / "supertonic-archive" / "assets"
    target = ROOT / "diza-live" / "fastcpu-lab" / "outputs"
    target.mkdir(parents=True, exist_ok=True)
    t0=time.monotonic()
    engine = load_text_to_speech(str(model / "onnx"), use_gpu=False)
    print(f"MODEL_READY time={time.monotonic()-t0:.3f}s CPU={os.cpu_count()}", flush=True)
    utterances=[
        ("santai_085","Halo, aku Diza. Gimana kabar kamu hari ini?"),
        ("teknis_085","Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar."),
    ]
    result=[]
    for voice in ["F1","F3"]:
        style = load_voice_style([str(model / "voice_styles" / f"{voice}.json")])
        for nsteps in (2,5):
            # Warm the execution providers for each configuration.
            warm, warmdur = engine("Tes satu dua tiga.", "id", style, nsteps, speed=0.85)
            for label,sentence in utterances:
                tick=time.monotonic()
                wav, duration=engine(sentence,"id",style,nsteps,speed=0.85)
                elapsed=time.monotonic()-tick
                audio=np.asarray(wav[0],dtype=np.float32)
                secs=float(np.asarray(duration).reshape(-1)[0])
                audio=audio[:int(engine.sample_rate*secs)]
                if not (np.isfinite(audio).all() and secs > 0.5 and secs < 30):
                    raise RuntimeError("Invalid speech output")
                filename=f"supertonic3_{voice}_{nsteps}step_{label}.wav"
                sf.write(target/filename,audio,engine.sample_rate,subtype="PCM_16")
                row={"model":"Supertonic3","voice":voice,"steps":nsteps,"tempo":0.85,
                     "test":label,"generation_s":round(elapsed,3),"audio_s":round(secs,3),
                     "rtf":round(elapsed/secs,4),"file":filename}
                print("RESULT "+json.dumps(row),flush=True)
                result.append(row)
    (target/"results.json").write_text(json.dumps(result,indent=2))
    print("DONE",len(result),"isolated CPU syntheses; evaluate voice identity and pronunciation separately.",flush=True)

if __name__=="__main__":
    main()
