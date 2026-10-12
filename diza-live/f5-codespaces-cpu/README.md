# Bloks F5 Indo V2: zero-card CPU benchmark on GitHub Codespaces

**Purpose:** Check whether the exact female F5 model already approved by the user can synthesize fast enough on free virtual CPU. No Bloks UI, Railway deployment, main, DIZA v19, or secret changes.

**Limits:** 2026 GitHub Free personal accounts include 120 core-hours and 15 GB-month storage. On a 4-core Codespace this works out to ~30 running hours per month; on 2-core ~60 hours. The machine normally stops after 30 minutes idle. **This is a disposable development benchmark, not reliable 24/7 Call hosting.** No paid resources.

1. Open this branch in GitHub > **Code > Codespaces > Create codespace**. Choose **4-core (8 GB RAM)** if your account offers it; F5 CPU may be out of memory on a smaller machine. No payment method should be necessary if within the account's free quota.
2. The `.devcontainer/devcontainer.json` prepares Python 3.11 CPU-only Torch and F5-TTS. Installation can take several minutes and consumes Codespaces storage/quota.
3. In Codespaces terminal run:
   ```bash
   python diza-live/f5-codespaces-cpu/benchmark.py
   ```
4. The benchmark first downloads publicly published `f5_tts_indo_v2.pt` (~1.35 GB), `vocab.txt`, and female `ref_reporter.mp3`, then loads F5/Vocos **once on CPU**, generates two Indonesian phrases using **16 NFE / 0.85 speed**, and prints generation time, audio duration, and RTF. WAV files are saved to `diza-live/f5-codespaces-cpu/outputs/`. Do not commit these weights or audio to the GitHub repo.
5. **Go/no-go:** If warm RTF is much greater than 1, this CPU is too slow for natural Call. Even if RTF<1, true Call latency includes Gemini STT, AI reply, network, and output playback. Validate quality separately.

No server/HTTP endpoint or public port is started by this benchmark. If performance is promising, a separate authenticated F5 CPU API prototype can be tested using a forwarded Codespaces port; public port URLs are internet-accessible and must not be treated as private. Developer workspaces are transient and cannot be used as stable production services.

Model: https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2 . License **CC-BY-NC-4.0**; respect its restrictions.

Official references:
- https://docs.github.com/en/billing/concepts/product-billing/github-codespaces
- https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
