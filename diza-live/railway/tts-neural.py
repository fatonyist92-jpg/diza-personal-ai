#!/usr/bin/env python3
"""Produce neural Indonesian speech as MP3 on stdout. Read input text from stdin.
No shell, no API key, no local model, no logging content or credentials.
"""
import asyncio
import sys

import edge_tts

VOICES = {"id-ID-GadisNeural", "id-ID-ArdiNeural", "en-US-JennyNeural", "en-US-GuyNeural"}

async def main() -> None:
    voice = sys.argv[1] if len(sys.argv) == 2 else ""
    if voice not in VOICES:
        raise ValueError("unsupported neural voice")
    text = sys.stdin.read(3500).strip()[:2500]
    if not text:
        raise ValueError("empty speech input")
    speaking = edge_tts.Communicate(text, voice, rate="-3%", pitch="+0Hz")
    sent = 0
    async for item in speaking.stream():
        if item.get("type") == "audio":
            chunk = item.get("data", b"")
            sent += len(chunk)
            if sent > 2_500_000:
                raise ValueError("speech audio size exceeded")
            sys.stdout.buffer.write(chunk)
    sys.stdout.buffer.flush()
    if sent < 200:
        raise RuntimeError("speech provider returned no audio")

if __name__ == "__main__":
    try:
        asyncio.run(asyncio.wait_for(main(), timeout=32))
    except Exception:
        print("Neural voice synthesis unavailable", file=sys.stderr)
        sys.exit(2)
