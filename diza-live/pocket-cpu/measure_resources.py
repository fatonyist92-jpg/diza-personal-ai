#!/usr/bin/env python3
"""CPU staging resource envelope benchmark: resident memory & peak RAM.

No external HTTP services, no Railway, no user recordings.
"""
import json
import os
import resource
import subprocess
import time
from pathlib import Path

import torch
from huggingface_hub import hf_hub_download
from pocket_tts import TTSModel

root=Path(__file__).resolve().parent
ref=root/".local"/"resource-test-reference.wav"
ref.parent.mkdir(exist_ok=True,parents=True)
def rss_peak_mb():
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1)
def rss_live_mb():
    try:
        line=next(l for l in Path("/proc/self/status").read_text().splitlines() if l.startswith("VmRSS:"))
        return round(int(line.split()[1])/1024,1)
    except Exception: return -1
torch.set_num_threads(2)
print("RESOURCE_INITIAL",json.dumps({"rss_mb":rss_live_mb(),"peak_mb":rss_peak_mb(),"cpu_cores":os.cpu_count()}),flush=True)
mp3=hf_hub_download(repo_id="Eempostor/F5-TTS-INDO-FINETUNE-V2",filename="ref_reporter.mp3",local_dir=str(ref.parent))
subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y","-i",mp3,"-ar","48000","-ac","1",str(ref)],check=True)
t=time.monotonic()
model=TTSModel.load_model(config="hf://anak10thn/pocket-tts-indonesian/indonesian_6l.yaml@17257664e384561c957b02ac92edd1a24807f0e5",eos_threshold=-6.0)
print("RESOURCE_MODEL",json.dumps({"time_s":round(time.monotonic()-t,2),"rss_mb":rss_live_mb(),"peak_mb":rss_peak_mb()}),flush=True)
state=model.get_state_for_audio_prompt(str(ref))
print("RESOURCE_VOICE",json.dumps({"rss_mb":rss_live_mb(),"peak_mb":rss_peak_mb()}),flush=True)
for name,text in [
    ("short","Halo, aku Diza. Gimana kabar kamu hari ini?"),
    ("technical","Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar.")
]:
    t=time.monotonic()
    out=model.generate_audio(state,text)
    duration_s=out.numel()/model.sample_rate
    print("RESOURCE_SYNTH",json.dumps({"test":name,"time_s":round(time.monotonic()-t,3),"duration_s":round(duration_s,3),"rss_mb":rss_live_mb(),"peak_mb":rss_peak_mb()}),flush=True)
print("RESOURCE_PASS",flush=True)
