# DIZA LIVE / Stage 01 — Bloks Core Foundation

Status: foundation implementation with automated contract tests. **Not yet an APK or realtime voice.**

## Design decision
The upstream Bloks core is the only authority for agents, provider routing, history, files and memory.
No DIZA v19 source is used. The application-specific code lives under this directory.

- Locked upstream: see UPSTREAM.lock.json (exact commit, not moving main).
- This branch was created from the pre-existing bloks-diza-web branch only as a GitHub workspace.
  Its inherited source is **NOT** treated as the clean upstream baseline.
  CI checks out official Bloks independently at the pinned commit.
- Stage-01 core-bridge.mjs is an HTTP/SSE contract prototype used to establish how the
  later native Android adapter will communicate with the core.
- Android UI, microphone permissions, streaming audio, interruption, and lip-sync
  are deliberately **out of scope for Stage 01**.
- No image assets, user documents, API keys, device tokens, signing keys, or secrets in Git.

## Confirmed upstream contracts
1. GET /api/health: handshake + capability discovery.
2. GET /api/bots?messages=N: list agent IDs and bounded recent transcript.
3. POST /api/bots/:id/messages: send a text turn into the existing Bloks thread.
4. GET /api/events?since=N: server-sent event stream, with resume sequence.
5. POST /api/calls/claim + /renew, DELETE /api/calls: one-owner call lease.
6. Memory and transcript persistence are **server-owned**, not APK-owned.

## Android integration contract for later stages
- Native Kotlin app will perform device pairing and store any pairing token
  in Android protected storage, never source-controlled.
- Production transport must use HTTPS with authenticated remote access;
  local HTTP is allowed only on actual device loopback.
- Android uses REST and consumes SSE events. Speech/streaming transport will be
  designed in Stage 02–03. Stage-01 bridge is **not an Android audio bridge**.
- Server remains persistent on a host; a small laptop is optional.
- If a fast chat engine lacks tools, deep tool actions must stay with a suitable
  Bloks agent. Do not promise capabilities the selected driver lacks.
- Use the same Bloks agent/thread for text and live transcript turns.
- Keep UI voice behavior separate from Bloks' provider implementation.

## QC
Run: `node --test diza-live/stage-01/core-bridge.test.mjs`
Run upstream verifier after cloning exact lock SHA:
`node diza-live/stage-01/verify-upstream.mjs ./bloks-upstream`

The Stage-01 GitHub Actions job performs both checks.
Acceptance: pinned official source verified, contract tests green, no
credential committed, branch remains separate from main. Later stages
must independently demonstrate real Android build and on-device audio.
