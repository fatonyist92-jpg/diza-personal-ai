#!/usr/bin/env python3
"""Isolated Pocket TTS Indonesian CPU voice-clone quality/speed comparison.
No changes to Railway, Bloks UI, main, F5 approved settings, or voice routing.
"""
import json
import os
import subprocess
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download
from pocket_tts import TTSModel

ROOT=Path(__file__).resolve().parent
OUT=ROOT/"outputs-pocket"
OUT.mkdir(parents=True,exist_ok=True)
REF_DIR=ROOT/"reference"
REF_DIR.mkdir(exist_ok=True)

def main():
    torch.set_num_threads(2)
    source=hf_hub_download(repo_id="Eempostor/F5-TTS-INDO-FINETUNE-V2",
        filename="ref_reporter.mp3",local_dir=str(REF_DIR))
    ref_wav=REF_DIR/"ref_reporter_48k_mono.wav"
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                    "-i",str(source),"-ar","48000","-ac","1",str(ref_wav)],check=True)
    print("REFERENCE prepared from the exact approved F5 Indonesian female MP3.",flush=True)
    t0=time.monotonic()
    model=TTSModel.load_model(
        config="hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@17257664e384561c957b02ac92edd1a24807f0e5",
        eos_threshold=-6.0)
    print(f"MODEL_READY time={time.monotonic()-t0:.3f}s",flush=True)
    t0=time.monotonic()
    state=model.get_state_for_audio_prompt(str(ref_wav))
    print(f"VOICE_PROMPT_READY time={time.monotonic()-t0:.3f}s",flush=True)
    samples=[
       ("santai_085","Halo, aku Diza. Gimana kabar kamu hari ini?"),
       ("teknis_085","Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar."),
    ]
    results=[]
    for name,sentence in samples:
        t0=time.monotonic()
        with torch.inference_mode():
            audio=model.generate_audio(state,sentence)
        generate_s=time.monotonic()-t0
        samples_np=audio.detach().cpu().numpy().reshape(-1).astype(np.float32)
        duration_s=len(samples_np)/model.sample_rate
        if not (np.isfinite(samples_np).all() and 0.5<duration_s<30):
            raise RuntimeError(f"Invalid output for {name}: {duration_s}s")
        filename=f"pocket_id_clone_{name}.wav"
        sf.write(OUT/filename,samples_np,model.sample_rate,subtype="PCM_16")
        result={"engine":"Pocket-TTS-Indonesian-6layer", "voice":"approved F5 reporter reference",
            "note":"native speed; 0.85 setting is NOT an available equivalent in this API",
            "test":name,"generate_s":round(generate_s,3),
            "audio_s":round(duration_s,3),
            "rtf":round(generate_s/duration_s,3),"file":filename}
        results.append(result)
        print("RESULT "+json.dumps(result),flush=True)
    (OUT/"results.json").write_text(json.dumps(results,indent=2))
    print("DONE 2/2 CPU synthesized; subjective naturalness/identity not verified.",flush=True)

if __name__=="__main__":
    main()
