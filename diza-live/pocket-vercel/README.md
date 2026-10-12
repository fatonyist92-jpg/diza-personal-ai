# Bloks Pocket Indonesian voice on isolated Vercel Hobby

Staging project independent of locked Bloks Railway. Root directory: `diza-live/pocket-vercel`. A dedicated Vercel Hobby project deploys only the `bloks-call-fastcpu-lab-20261012` branch.

The build downloads a fixed public ONNX INT8 CPU bundle from a dedicated GitHub Release. The bundle's models have CC-BY-4.0 license. The runtime is MIT (multilingual PocketTTS.cpp fork). The reference speaker audio is the publicly distributed `ref_reporter.mp3` from Eempostor/F5-TTS-INDO-FINETUNE-V2; respect the voice rights.

The implementation does not change Railway, main, existing UI, STT, Gemini, Muse or Call.

Public `GET /health` indicates deployed assets. Private `POST /v1/tts` accepts existing authenticated JSON:
`{"text":"Halo, aku Diza.","language":"id","voice":"female"}`
with `Authorization: Bearer <POCKET_CPU_TTS_TOKEN>`. It returns PCM16 WAV for the existing Bloks client. Set secure `POCKET_CPU_TTS_TOKEN` on Vercel (do not commit). Only send text to a publicly accessible voice service after explicit voice opt-in.

Cold function may require 1-10 seconds. The 2 GB / 1 vCPU Vercel Hobby function has platform monthly quotas; always-on processes are not available and Call playback cancellation must happen on the client.

A successful deployment must be checked with real HTTPS `POST /v1/tts` and then integrated explicitly into the locked Bloks Call code by a separately approved change. This repo alone does NOT alter Bloks production routing.
