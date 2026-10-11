# Bloks Kaggle GPU Voice Lab · Indonesia
**Isolated laboratory, not deployed to Railway.**

Date: 2026-10-12.
Goal: native Indonesian FEMALE neural voice, lower foreign accent, optional big GPU model without paid TTS API.

## 2026-10-12: FIX Kaggle Python dependency failure
Screenshot from Kaggle shows `chatterbox-tts==0.1.1` pinned `numpy==1.26.0` but notebook runtime cannot install that old NumPy on newer Python. **Do not install it into the Kaggle kernel.** Use the revised `Bloks_Kaggle_GPU_Voice_Lab_Indonesia_FIX_Python311.ipynb` notebook provided as a download in the ChatGPT conversation; the corrected notebook itself has not been added to this GitHub branch. It provisions isolated Python 3.11 environments using uv and runs Chatterbox and F5 separately. The notebook was validated for JSON schema and all cell Python syntax locally; **GPU execution was not accessible/verified here**, so do not claim full TTS success before Kaggle Run All and native-language listening. No Railway live changes.

## Artifact
Kaggle import-ready Jupyter notebook `Bloks_Kaggle_GPU_Voice_Lab_Indonesia.ipynb` was generated and validated as an attached ChatGPT download. Use **Kaggle Code > New Notebook > Import Notebook**; in Settings enable **GPU accelerator** and **Internet**. Do not put any user chats, secret tokens or login details in the public notebook.

The notebook tests:
1. `grandhigh/Chatterbox-TTS-Indonesian` (Apache 2.0, fine-tuned Indonesian checkpoint, model architecture 0.5B), with optional consent-based female voice reference.
2. `Eempostor/F5-TTS-INDO-FINETUNE-V2` (CC-BY-NC-4.0, ~1.35GB checkpoint, demo female voice reference, 131.79 hours ID speech). For A/B both enabled by default. Model demo voice should not be used for celebrity/public-figure impersonation.

Identical scripts cover everyday Indonesian conversation, AVM machine hydraulic terminology and emotion. Check if the generated audio hallucinated/repeated, log render time, score accent/pronunciation/naturalness via native Indonesian listening. No claim of Gemini-equivalent quality before real on-GPU and human listening acceptance.

## Scope and deployment lock
- GitHub main, DIZA v19, Bloks UI, Codex, Muse Spark, Gemini STT, pairing and Railway persistent volume unchanged.
- Never merge a Kaggle notebook experiment directly to the protected live branch, never copy any credentials into Kaggle.
- Kaggle CPU/GPU notebooks are limited-duration experiments, NOT official always-on external inference endpoints. Do not publish tunnels or bypass the platform's service restrictions.
- Connect voice to Bloks **only after** a native-listening pass, performance check, compatible hosting rules, and legitimate authenticated API setup.
- Gemini Aoede working reference preserved separately at GitHub branch `bloks-gemini-aoede-voice-LOCKED-20261012`.

Documentation:
- https://huggingface.co/grandhigh/Chatterbox-TTS-Indonesian
- https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2
- https://www.kaggle.com/docs/notebooks
- https://www.kaggle.com/docs/efficient-gpu-usage

## Kaggle live support: 2026-10-12 FIX v4
Screenshot after FIX v3 confirmed Torch/GPU and Chatterbox dependency installer passed, but the next import failed with `ModuleNotFoundError: No module named 'pkg_resources'` via old `librosa.core.intervals`. Root cause: isolated `chatterbox311` venv missing setuptools version that still bundles `pkg_resources`. Pin **`setuptools==80.9.0` in that venv**, not system Kaggle kernel. In same live notebook session: `uv pip install --python /kaggle/working/bloks_voice_lab_fix/chatterbox311/bin/python --no-deps setuptools==80.9.0`, then retry imports. Full revised notebook `Bloks_Kaggle_GPU_Voice_Lab_FIX_v4_pkg_resources.ipynb` provided in ChatGPT and validated locally (nbformat and Python syntax). It is *not* a verified Kaggle run or a live Railway deployment.
