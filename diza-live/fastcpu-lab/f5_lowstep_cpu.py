#!/usr/bin/env python3
"""F5 Indo V2 LOW STEP CPU experiment; do not change approved live 16NFE voice."""
import os
os.environ["MPLBACKEND"]="Agg"
os.environ["CUDA_VISIBLE_DEVICES"]=""
import pathlib,time,json
import numpy as np
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download
from f5_tts.api import F5TTS

ROOT=pathlib.Path(__file__).resolve().parent
OUT=ROOT/"outputs-f5";OUT.mkdir(exist_ok=True)
MODEL_DIR=ROOT/"model-cache";MODEL_DIR.mkdir(exist_ok=True)
REPO="Eempostor/F5-TTS-INDO-FINETUNE-V2"
REF_TEXT="dikatakan ternyata cek 3 miliar yang diberikan untuk mahar pernikahan ini adalah palsu."

def main():
    torch.set_num_threads(min(4,os.cpu_count() or 2))
    files={n:hf_hub_download(repo_id=REPO,filename=n,local_dir=str(MODEL_DIR))
           for n in ("f5_tts_indo_v2.pt","vocab.txt","ref_reporter.mp3")}
    started=time.monotonic()
    engine=F5TTS(model="F5TTS_v1_Base",ckpt_file=files["f5_tts_indo_v2.pt"],
                 vocab_file=files["vocab.txt"],device="cpu")
    print(f"MODEL_READY {time.monotonic()-started:.2f}s",flush=True)
    phrase="Halo, aku Diza. Gimana kabar kamu hari ini?"
    rows=[]
    for steps in (4,8):
        tic=time.monotonic()
        with torch.inference_mode():
            wav,sr,_=engine.infer(ref_file=files["ref_reporter.mp3"],ref_text=REF_TEXT,
                gen_text=phrase,nfe_step=steps,speed=0.85,
                show_info=lambda *_a,**_kw: None,progress=None,file_wave=None)
        seconds=time.monotonic()-tic
        a=np.asarray(wav,dtype=np.float32).reshape(-1)
        length=len(a)/sr
        if not (np.isfinite(a).all() and 0.5 < length < 25):
            raise RuntimeError("Invalid speech")
        fname=f"F5_IndoV2_CPU_nfe{steps}_tempo085.wav"
        sf.write(OUT/fname,a,sr,subtype="PCM_16")
        row={"engine":"F5-Indo-V2","nfe":steps,"speed":0.85,
             "generation_s":round(seconds,3),"audio_s":round(length,3),
             "rtf":round(seconds/length,3),"file":fname}
        rows.append(row)
        print("RESULT "+json.dumps(row),flush=True)
    (OUT/"results.json").write_text(json.dumps(rows,indent=2))
    print("DONE low NFE CPU only; these voices are experimental, live remains 16 NFE.",flush=True)

if __name__=="__main__":
    main()
