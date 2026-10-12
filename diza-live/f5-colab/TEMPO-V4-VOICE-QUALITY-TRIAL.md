# F5 Indonesian V2: natural tempo tuning (2026-10-12)

User listened to three successful F5 CLEAN v3 WAV tests on Colab T4 and reports the generated voice is **slightly rushed**, while otherwise usable. Measured warm 16 NFE: 0.87s generation for 2.35s audio; 1.37s for 4.00s audio, F5/Vocos first loaded in 6.39s, GPU peak 1990 MiB.

Official F5 internals (`src/f5_tts/infer/utils_infer.py`) use `duration = reference_duration + proportional_generated_duration / local_speed`. Thus a speed parameter slightly **under 1.0** lengthens the generated audio inside the model, unlike changing media playback speed after generation.

New complete importable standalone Colab notebook **Bloks_F5_Indonesia_Colab_Persistent_TEMPO_v4.ipynb** is delivered as a ChatGPT file; it is not committed here. It reuses cached user Colab Python 3.11 environment/checkpoint and generates A/B comparison with same text/model/16 NFE: 1.00 original, 0.92 (initial recommendation), 0.85 (slower). Also checks Indonesian technical pronunciation at 0.92. F5 and Vocos load once per benchmark worker run; progress=None to avoid the fixed `tqdm_asyncio.tqdm` mismatch; `MPLBACKEND=Agg` for Kaggle/Colab compatibility.

Notebook format, all cell Python syntax and embedded worker source were locally checked. **No Colab GPU measurement yet for speed 0.92/0.85; user must listen before locking their choice.** Does not create an API, tunnel, Railway production deploy, key or paid Google endpoint.
