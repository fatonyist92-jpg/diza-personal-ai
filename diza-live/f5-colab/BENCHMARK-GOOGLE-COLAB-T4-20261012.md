# F5-TTS Indo V2 female · Google Colab NVIDIA T4 benchmark

**Evidence:** screenshot submitted by user 2026-10-12 ~07:09 WIB, from CLEAN v3 fixed tqdm progress callback notebook. This measures an actual F5 GPU inference test; not a Bloks Call end-to-end test.

| Measure | Value |
|---|---:|
| Successful samples | 3/3 |
| GPU | NVIDIA T4 (Google Colab) |
| Model/vocoder load once | 6.39 seconds |
| Peak GPU allocated VRAM | 1,990 MiB (~1.94 GiB) |
| Santai (32 NFE, first inference) | 6.44 s generation for 2.35 s audio (RTF 2.740) |
| Santai (16 NFE, warmed) | 0.87 s generation for 2.35 s audio (RTF 0.370) |
| Teknis (16 NFE, warmed) | 1.37 s generation for 4.00 s audio (RTF 0.343) |

## Interpretation / what is and isn't proven

- F5 Indonesian female can synthesize on T4 faster than real-time **after the model is loaded** at 16 NFE.
- The 32 NFE result is the first generation and may include warm-up. Do **not** interpret 32 vs 16 NFE speedup as a controlled 7x benchmark without same-state repeated trials.
- Voice-quality approval for original F5 demo and 3 previous Kaggle samples doesn't necessarily imply approval for 16 NFE. Ask user to listen specifically to `santai_16` and `teknis_16` before locking final voice settings.
- A Call includes mic/STT, LLM first reply, F5 generation, network, decoding and playback; none of those additional delays are included here.
- Colab GPU is a session-based notebook, **not** a legitimate always-on web speech API for Railway. No auto-created external endpoint and no tunnel.
- Railway free 0.5–1GB CPU-only setup cannot host full ~1.35GB F5 checkpoint plus PyTorch/Bloks, whereas user confirmed at least ~2GB peak GPU allocated in Colab.

## Next gates

1. User listens to both 16 NFE WAV files and approves sound quality.
2. Repeat warmed 16 NFE with 5–10 short utterances and capture p50/p95 latency, memory, quality.
3. Deploy an external authorized GPU endpoint under free/no-card terms that actually offers API access. This remains a **blocker**; Hugging Face ZeroGPU creation was not available to user's current account; Colab may not be used to circumvent hosting restrictions.
4. Link authorized endpoint using existing secure opt-in staging providers, then perform 2-way real-device Call tests before touching Railway production.
5. Preserve all locked UI, Gemini Aoede baseline, Codex, Muse Spark, Gemini STT, pairing, and volume. Never declare F5 Call activated before end-to-end proof.
