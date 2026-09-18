# Diza Personal AI

Prototype Android personal assistant milik Fatoni.

## Fokus v0.2.1
- GPT Voice Realtime via WebRTC
- ephemeral client secret dari backend
- API key OpenAI tidak pernah ditanam di APK
- avatar Diza besar dan reactive
- transcript user + Diza di UI
- server VAD + interruption/barge-in
- backend siap deploy via Render Blueprint
- GitHub Actions siap build APK debug

## Arsitektur
Android APK -> GET /token di backend -> ephemeral client secret -> WebRTC langsung ke OpenAI Realtime

## Deploy backend
Repo ini punya render.yaml. Di Render, buat Blueprint dari repo ini lalu isi secret OPENAI_API_KEY.

## Build APK
Set repository variable GitHub:
DIZA_REALTIME_BACKEND_URL=https://URL-BACKEND-KAMU.onrender.com

Lalu jalankan workflow Build Diza APK dari tab Actions.

## Catatan
Avatar sekarang reactive terhadap state/audio, belum photoreal facial lip-sync. Modul lip-sync realistis masuk tahap berikutnya.
