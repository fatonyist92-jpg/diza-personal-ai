# Actual F5 Indo V2 CPU benchmark · 2026-10-12

Source: GitHub Actions run https://github.com/fatonyist92-jpg/diza-personal-ai/actions/runs/38198057736 . The `Actual F5 Indo V2 CPU speech synthesis test` job completed SUCCESS after running actual synthesis on GitHub-hosted Ubuntu Linux **CPU**, not in the user's independently opened Codespace.

**Voice approved by user:** Eempostor/F5-TTS-INDO-FINETUNE-V2 female clone using ref_reporter.mp3, F5TTS_v1_Base, nfe_step=16 and native speed=0.85.

| Test | Generation wall clock | WAV duration | Real-time factor | Status |
|---|---:|---:|---:|---|
| santai_085 | 57.04s | 2.76s | **20.648** | PASS |
| teknis_085 | 72.57s | 4.70s | **15.428** | PASS |

F5+Vocos loaded on CPU in **2.38 seconds**; warm model took many seconds per utterance. `RESULT: 2/2 passed`. GitHub runner advertised **4 CPUs**. Results measure synthesis only, no LLM/STT/network/call or guaranteed audio quality.

**Comparison**: Colab NVIDIA T4 generated `santai_085` 2.76s WAV in 1.24s (RTF 0.449). The free GitHub CPU runner is unsuitable for low-latency two-way voice calls at these F5 settings. Other CPU architectures/optimizers may differ, but cannot be assumed to deliver subsecond latency.

Initial two runs failed due to dependency mismatches. The successful setup pins torch 2.5.1 CPU-only and transformers 4.47.1. Source validation also SUCCESS.

This run did NOT use/open the user's Codespaces terminal, did NOT create any public API or deploy into production, and did NOT alter Railway Bloks, DIZA v19, UI, secret variables, or pairing.

Other potential routes: optimizing CPU through ONNX/OpenVINO requires converting F5 Indo V2 weights and benchmarking before any low-latency claim; or use authorized external GPU compute with reliable reachable API. No free stable CPU endpoint established.
