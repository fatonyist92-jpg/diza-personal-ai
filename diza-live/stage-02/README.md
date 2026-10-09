# DIZA LIVE — STAGE 02 / Native Voice Prototype

Stage 01 is frozen on the parent branch `diza-live-stage-01-core`. This stage adds
a new Android app under `stage-02/android`. The old DIZA v19 APK and customized
legacy `android-shell` are **not used**.

## Implemented end-to-end path

1. Enter an **HTTPS** Bloks server origin and pair with a six-digit code provided
   by the official Bloks server's pairing settings.
2. The returned per-device token is encrypted using AndroidKeyStore and is not
   embedded in the APK or source.
3. Load agents from `GET /api/bots`; choose one.
4. Claim the existing Bloks call lease `POST /api/calls/claim`; renew while active
   and release it at hang-up.
5. Android `SpeechRecognizer` captures a final Indonesian utterance.
6. Snapshot existing bot messages, send to `POST /api/bots/:id/messages`.
7. Poll `GET /api/bots?messages=60` until a **new** non-empty completed bot
   reply is present; reject duplicate/historical messages.
8. Android `TextToSpeech` reads the reply in Indonesian. The completion callback
   automatically starts listening again.
9. Press End to cancel microphone, stop playback, and release call lease.

**This app is an audio/protocol laboratory UI.** It is deliberately NOT the
final avatar design. Stage 03 replaces response polling with a low-latency
stream and adds audio interruption; Stage 04 adds the agreed full-screen avatar.

## Requirements

- An Android phone (Android 8.0+), installed speech recognizer, Indonesian
  TTS voice data, microphone permission, and network.
- Reachable persistent upstream Bloks core at an HTTPS origin.
- Bloks remote access enabled and the device paired using the official
  pairing workflow. If no agent exists, create a Diza agent first.
- Engine/model configured at **Bloks server**, not in Android APK. An AI provider's
  free tier or voice speech recognition may require network/data and has limits.

## Security boundaries

- HTTPS only: plaintext HTTP and insecure redirects are not accepted.
- Pairing token stays encrypted in Android Keystore-backed preferences with
  backup disabled; model/provider credentials remain on server.
- No credentials, source documents, or reference photographs bundled in APK.
- Agent access still obeys Bloks pairing permissions. No implicit open proxy.
- Microphone is activated only in an active call and stops at hangup/exit.
- Java networking uses a dedicated worker thread; no AI client inside APK.
- This is a **prototype**, not a guaranteed background listening assistant.

## Build / QC

CI: `.github/workflows/diza-live-stage-02.yml`.

- JDK 17 unit tests for 10 sequential state transitions (not 10 actual voice turns).
- Run Stage 01 HTTP contract regression suite.
- Compile Gradle Android SDK 35 debug APK independently of legacy shell.
- Verify actual APK zip, DEX, Android v2 signature; upload signed debug
  APK as a GitHub Actions artifact.

## Acceptance to close Stage 02

- [ ] APK installs and opens on a physical Android phone.
- [ ] Remote Bloks pairing accepted from a user-generated code.
- [ ] Agent list loads and selected agent receives transcript.
- [ ] 10 **real** consecutive spoken turns, with return to listening each time.
- [ ] No duplicate replies; call stops and releases lease correctly.
- [ ] Microphone permission denial, unavailable speech service, no Indonesian
      voice data, and server timeout handled visibly.
- [ ] Reconnect after app restart with stored paired-device token.
- [ ] Record actual audio latency and failures.

A successful debug APK CI build meets the **code/build milestone**, not
the **device voice acceptance** milestone. Do not mark the full Stage 02
complete until a physical-phone test passes.

See official Bloks FSL-1.1-MIT license in the pinned upstream source.
