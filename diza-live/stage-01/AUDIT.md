# DIZA Live — Stage 01 Architecture Audit

Upstream authoritative repository: https://github.com/hamedgitty/bloks
Pinned revision: `ba36e7604e5c283bbebed4e4f99d3273f92ec0ec` (Bloks 2.5.32).
This document describes the upstream core, **not** the previously customized DIZA v19.

## 1. Existing Bloks components

| Capability | Upstream source | Stage 01 decision |
| --- | --- | --- |
| Agent + provider registry | `server/providers.ts`, `server/harness/registry.ts` | Reuse existing agent provider selection |
| Chat turn pipeline | `server/index.ts`, `src/state/store.tsx` | Call `POST /api/bots/:id/messages` |
| Message and event stream | `server/index.ts`, `server/contracts.ts` | Consume `GET /api/events?since=N` |
| Thread persistence | `server/store.ts`, `server/config.ts` | Bloks server owns conversation data |
| Agent memory | `server/memory-journal.ts`, `server/workspace.ts` | Respect Markdown memory and journal |
| File attachments | `server/attachments.ts` | Retain secure server-side file upload convention |
| Phone pairing | `server/pairing.ts`, `server/http-guard.ts` | Android must pair; never embed shared static credentials |
| Existing voice | `src/components/Voice.tsx`, `server/speech.ts` | Reuse voice options and call lease, replace listen/think/speak loop later |
| Call exclusivity | `server/index.ts` | Reuse claim, renew, hangup |
| Engine limitations | `docs/ARCHITECTURE.md` | Some chat HTTP providers stream text but do not run native tools |

## 2. New Android boundary

Stage 02 uses a native Android audio client. The Bloks backend persists on a separate host with durable storage.
A small laptop is **optional**, not required. No promise of perpetual free hosting.

Later Android stages must support:
- Persistent full-screen reference-photo avatar without scaling down during chat.
- Tap-to-toggle hidden side actions; bottom dock stays visible and moves with the keyboard.
- Android audio input/output and interruption independent of WebView speech APIs.
- REST + authenticated SSE for agent messages, status, and history.
- Separate realtime audio transport if Bloks REST/SSE proves insufficient for continuous audio.
- Shared text and spoken conversation thread; no duplicate memory database.
- Disabled/missing capabilities displayed honestly, not as dead buttons.

## 3. Important restrictions

1. Bloks license: **FSL-1.1-MIT**. Personal or internal use permitted; commercial competing uses restricted before automatic conversion. Keep license/copyright notices.
2. Upstream is not identical to the `bloks-diza-web` branch, even if some blobs match. Do not treat inherited source as the trusted core.
3. Bloks is predominantly local-first; remote Android access requires a secure pairing/relay or an authenticated HTTPS bridge.
4. Text streaming is already present, but Android hands-free interruption and incremental TTS playback are *not* demonstrated by Stage 01.
5. Android secrets, pairing tokens, provider keys, and personal avatar imagery must not enter this public repository.
6. Loading all files into each prompt would create latency. Retrieval strategy belongs to Stage 06, with source attribution where possible.

## 4. Stage 01 acceptance

- [x] Official upstream commit and license pinned in `UPSTREAM.lock.json`.
- [x] Isolated GitHub branch created without altering main.
- [x] Stable REST/SSE contract adapter written with a secure transport rule.
- [x] Automated contract tests written (7 scenarios).
- [x] CI upstream checkout check against exact pinned commit and key paths.
- [x] Live upstream server smoke test: /api/health and /api/bots responded successfully on a clean instance (GitHub Actions run 37873931699).
- [ ] Android and voice acceptance: **not in Stage 01**.

The existing `diza-live/stage-01/core-bridge.mjs` is a portable proof of contract, not a replacement for native Kotlin audio or Bloks' actual memory layer.
