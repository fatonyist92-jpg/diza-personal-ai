# Diza Realtime Gateway

Backend ini menyimpan OPENAI_API_KEY hanya di server.

Alur:
1. APK minta ephemeral client secret ke GET /token.
2. Backend meminta client secret ke OpenAI memakai API key utama.
3. APK membuat WebRTC langsung ke OpenAI Realtime memakai client secret sementara.
4. API key utama tidak pernah ditanam di APK.

Endpoint:
- GET /health
- GET /token

Environment:
- OPENAI_API_KEY wajib
- DIZA_REALTIME_MODEL default gpt-realtime-1.5
- DIZA_VOICE default marin
- DIZA_SAFETY_IDENTIFIER optional
