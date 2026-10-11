---
title: Bloks F5 Indonesian Female Voice
emoji: 🎙️
colorFrom: gray
colorTo: blue
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
python_version: "3.10"
suggested_hardware: zero-a10g
models:
  - Eempostor/F5-TTS-INDO-FINETUNE-V2
license: cc-by-nc-4.0
short_description: Private F5-TTS Indonesian V2 female preview using official ZeroGPU API
---

# Bloks F5 Indo V2 (experimental, non-commercial)

- Designed for Hugging Face Gradio **ZeroGPU**, not for Kaggle reverse tunnels.
- F5 female model: [Eempostor/F5-TTS-INDO-FINETUNE-V2](https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2).
- F5 code: [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS).
- License: CC BY-NC 4.0. Non-commercial use only, attribution required, and respect source speaker rights.
- Demo reference: `ref_reporter.mp3`, accompanied by the actual transcript in `app.py`. Never imitate a specific non-consenting person's identity.

## Prerequisites
Free Hugging Face accounts are eligible to **host** up to 2 ZeroGPU
Gradio Spaces only after 30 days, verified email, and good standing.
Select **ZeroGPU** in Space hardware settings. Dynamic GPU availability and
usage quotas still apply (typically 5 minutes GPU/day for a free account).
The official user quota applies when calling via API with your token.

## Private token
Add this Space **secret**, never commit its value:
`F5_BRIDGE_SECRET` = 24+ randomly generated characters.

For public Space URLs, anyone can see the demo UI, but synthesis requires
the secret. For private Spaces, additionally authenticate with a scoped HF
token as required. Use this in a sandbox/test app only until authentication,
queue security, and voice quality are verified.

## API contract (official Gradio queue API)
Endpoint `/gradio_api/call/synthesize`:
`POST {"data":["Halo, aku Diza.","<F5_BRIDGE_SECRET>"]}`, response
`{"event_id":"..."}`, then GET the same endpoint with `/<event_id>`
as event stream. Result data is an audio file object with a URL.
Railway's bridge must fetch the file through a validated same-origin
`*.hf.space` URL, reject redirects and check it is RIFF WAV.
Authentication headers never go to unrelated hosts.

## State
This repo is a deployment **template**, not an active Space.
No HF Space was created from ChatGPT because the connected Hugging Face
OAuth permissions only allow reading repositories and running *billable*
Jobs, not writing Spaces. No charge or credit balance was incurred.
No railway production configs were changed.
