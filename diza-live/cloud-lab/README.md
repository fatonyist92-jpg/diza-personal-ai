# DIZA Live Cloud Pairing Lab

**Disposable lab only. Never use as a persistent chat or memory server.**

Pinned official Bloks commit: ba36e7604e5c283bbebed4e4f99d3273f92ec0ec.
License: FSL-1.1-MIT. DIZA v19 and Stage 01 untouched.

## Render configuration

- Docker runtime from path diza-live/cloud-lab/Dockerfile; context repository root.
- Branch diza-live-cloud-pairing-lab, free plan, Singapore region.
- Mandatory environment variable DIZA_LAB_ACK_EPHEMERAL=1.
- Render HTTPS address is used by Stage 2 Android APK.
- The server logs a temporary 6-digit pairing code on startup. It expires
  in 5 minutes and only 5 incorrect attempts are permitted. Treat private
  logs as sensitive. Do not paste pairing codes publicly.

## Major limits

Render Free spins down after 15 minutes idle; the local filesystem is
destroyed on sleep, restart or redeploy. Bloks stores conversations,
device-pairing hashes, and memory under ~/.bloks. Thus, after restart the
old pairing token is invalid, history is gone and new pairing is required.

This lab initially has no AI engine credentials, so successful pairing
DOES NOT mean the bot can respond to text or voice. Provider configuration
is separate. Never put provider API keys in a public repository.

The real production server must implement separate persistent storage,
or use a paid persistent disk with explicit user approval; this lab does
not meet production storage requirements.

## CI acceptance
Test a fresh upstream Docker boot, health endpoint, remote auth boundary,
one-time 6-digit pairing and authenticated agent discovery.
