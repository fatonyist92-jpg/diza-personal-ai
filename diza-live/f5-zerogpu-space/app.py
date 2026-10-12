"""Bloks F5 Indonesian V2 female voice lab, Hugging Face ZeroGPU Gradio API.
User-owned no-payment Space, pending live HF deployment/eligibility.
Non-commercial model: CC-BY-NC-4.0. Reference voice from its official public demo.
"""
import hmac
import os

os.environ["MPLBACKEND"] = "Agg"
os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"

import gradio as gr
import numpy as np
import spaces
from huggingface_hub import hf_hub_download

REPO = "Eempostor/F5-TTS-INDO-FINETUNE-V2"
REFERENCE_TEXT = (
    "dikatakan ternyata cek 3 miliar yang diberikan untuk mahar "
    "pernikahan ini adalah palsu."
)
SECRET = os.getenv("F5_BRIDGE_SECRET", "")
if len(SECRET) < 24:
    raise RuntimeError(
        "Configure F5_BRIDGE_SECRET (24+ chars) as a private Hugging Face Space secret."
    )

CKPT = hf_hub_download(REPO, "f5_tts_indo_v2.pt")
VOCAB = hf_hub_download(REPO, "vocab.txt")
REF_AUDIO = hf_hub_download(REPO, "ref_reporter.mp3")

# ZeroGPU requires CUDA model setup at MODULE LEVEL; GPU allocation is dynamic
# inside decorated methods. HF's CUDA emulation supports this pattern.
from f5_tts.api import F5TTS
MODEL = F5TTS(
    model="F5TTS_v1_Base",
    ckpt_file=CKPT,
    vocab_file=VOCAB,
    device="cuda",
)

@spaces.GPU(duration=60)
def synthesize(text: str, bridge_secret: str):
    if not hmac.compare_digest(
        bridge_secret if isinstance(bridge_secret, str) else "", SECRET
    ):
        raise gr.Error("Not authorized")
    if not isinstance(text, str):
        raise gr.Error("Invalid speech text")
    cleaned = text.strip()
    if not 1 <= len(cleaned) <= 350:
        raise gr.Error("Text length out of range (1..350)")
    audio, sample_rate, _ = MODEL.infer(
        ref_file=REF_AUDIO,
        ref_text=REFERENCE_TEXT,
        gen_text=cleaned,
        nfe_step=16,
        speed=0.85,
        remove_silence=False,
        progress=None,  # F5 compatible silent progress
    )
    wave = np.asarray(audio, dtype=np.float32).reshape(-1)
    seconds = wave.size / sample_rate
    if not 0.4 <= seconds <= 24 or not np.isfinite(wave).all():
        raise gr.Error("Invalid audio from model")
    return sample_rate, wave

with gr.Blocks(title="Bloks F5 Indonesian Female GPU Voice") as demo:
    gr.Markdown(
        "### F5 Indonesia V2 | Preview only | No commercial use\n"
        "Female reference: official public F5 reporter sample. "
        "Secure token required. GPU and quota are supplied by Hugging Face ZeroGPU."
    )
    text = gr.Textbox(label="Kalimat bahasa Indonesia", lines=2, max_lines=3,
                      value="Halo, aku Diza. Gimana kabar kamu hari ini?")
    secret = gr.Textbox(label="Kunci privat pemilik Space", type="password")
    output = gr.Audio(label="Hasil suara F5 perempuan", type="numpy")
    go = gr.Button("Buat suara")
    go.click(
        fn=synthesize, inputs=[text, secret], outputs=output,
        api_name="synthesize", concurrency_limit=1,
    )
demo.queue(default_concurrency_limit=1, max_size=6)
if __name__ == "__main__":
    demo.launch()
