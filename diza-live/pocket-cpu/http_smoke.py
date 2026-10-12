#!/usr/bin/env python3
"""Real HTTP integration smoke against locally launched Pocket Indonesian API."""
import json
import os
import time
import urllib.error
import urllib.request
import wave
import io

BASE=os.getenv("POCKET_TEST_URL","http://127.0.0.1:8765")
TOKEN=os.environ["POCKET_VOICE_TOKEN"]
HEADERS={
  "Authorization":"Bearer "+TOKEN,
  "Content-Type":"application/json",
  "Accept":"audio/wav",
}

def request(path, data=None, headers=None):
    req=urllib.request.Request(
        BASE+path,data=json.dumps(data).encode() if data is not None else None,
        headers=headers or {},method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req,timeout=25) as resp:
            return resp.status,resp.headers,resp.read()
    except urllib.error.HTTPError as e:
        return e.code,e.headers,e.read()

def main():
    deadline=time.monotonic()+120
    ready=False
    while time.monotonic()<deadline:
        try:
            status,_,data=request("/health")
            if status==200 and json.loads(data).get("ready") is True:
                ready=True
                break
        except (OSError,ValueError):
            pass
        time.sleep(1)
    if not ready: raise RuntimeError("Worker did not become healthy after model initialization")
    print("HTTP_READY=PASS",flush=True)
    payload={"text":"Halo, aku Diza.","language":"id","voice":"female"}
    code,_,_=request("/v1/tts",payload,{"Content-Type":"application/json","Authorization":"Bearer WRONG"})
    if code!=401: raise RuntimeError("Unauthenticated endpoint must reject with 401")
    print("HTTP_AUTH_401=PASS",flush=True)
    results=[]
    for label,spoken in (
        ("santai","Halo, aku Diza. Gimana kabar kamu hari ini?"),
        ("teknis","Tekanan target seratus enam puluh bar. Aktualnya seratus empat puluh bar."),
    ):
        payload["text"]=spoken
        tic=time.monotonic()
        code,headers,audio=request("/v1/tts",payload,HEADERS)
        elapsed=time.monotonic()-tic
        if code!=200 or headers.get_content_type()!="audio/wav":
            raise RuntimeError(f"{label}: status={code} content-type={headers.get_content_type()}")
        if not (audio[:4]==b"RIFF" and audio[8:12]==b"WAVE"):
            raise RuntimeError(f"{label}: invalid WAV data")
        with wave.open(io.BytesIO(audio),"rb") as wav:
            duration=wav.getnframes()/wav.getframerate()
            sample_rate=wav.getframerate()
        if not 0.4<duration<25:
            raise RuntimeError(f"{label}: invalid waveform duration {duration}")
        result={"label":label,"server_response_s":round(elapsed,3),
                "audio_duration_s":round(duration,3),"sample_rate_hz":sample_rate,
                "wav_bytes":len(audio),"rtf_http":round(elapsed/duration,3)}
        results.append(result)
        print("HTTP_WAV_OK="+json.dumps(result),flush=True)
    print("RESULT: HTTP_INTEGRATION 3/3 PASS",flush=True)

if __name__=="__main__":
    main()
