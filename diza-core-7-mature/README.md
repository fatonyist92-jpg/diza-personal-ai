# Item 7 — Mature Media Mesh

This module is intentionally separate from the locked Items 1-6.

Lanes:
- adult_text
- adult_image
- adult_i2v

Default routing philosophy:
- local/self-hosted first
- hosted providers opt-in only
- provider adult-policy must be explicit_allowed before routing
- unknown/suggestive-only providers are not eligible for explicit lane

Current default local lanes:
- Local uncensored LLM for adult text
- Local ComfyUI image pipeline for adult images
- Local Wan I2V pipeline for adult image-to-video

Hosted candidates:
- Venice AI
- NovelAI

Hosted candidates are disabled by default and require separate API onboarding.

Policy gate:
- confirmed adults only
- ambiguous age blocked
- non-consensual sexual content blocked
- real-person sexual content requires explicit consent confirmation

The mature-media router must never reuse or weaken the locked general Item 4-5-6 free-provider rules.
It is a separate capability mesh.
