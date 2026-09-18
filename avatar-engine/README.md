# Diza Natural Avatar Engine

Goal: photorealistic, natural avatar motion without paid avatar APIs.

## Free stack

- FasterLivePortrait / LivePortrait: head pose, eyes and expression.
- JoyVASA: audio-driven facial dynamics and head motion.
- MuseTalk 1.5: final lip-sync pass.

## Diza motion rules

- Never rotate/zoom the whole source photo to simulate life.
- Idle: micro eye motion, occasional blink, almost-zero head drift.
- Listening: subtle response only; no constant bobbing.
- Speaking: lip-sync from audio, limited jaw range, subtle cheek/brow movement.
- Randomize blink timing; avoid fixed loops.
- Preserve the source identity and skin texture.
- Target 25-30 FPS minimum.
- Prefer latency under 250 ms when hardware allows.

## Android integration

The APK is a thin client. The free avatar engine runs on user-owned GPU hardware and streams generated frames to Android. If the engine is unavailable, the APK displays the bundled still avatar instead of fake motion.
