# DIZA hosted mode

This branch keeps the Bloks desktop behavior unchanged by default and adds
an opt-in single-user web mode for DIZA.

## Required environment

- `DIZA_WEB_MODE=1`
- `DIZA_WEB_PASSWORD=<a private password of at least 16 bytes>`
- `PORT=<platform port>` (optional; defaults to 8799)

The web password is never stored in browser JavaScript. After login the
server sends an HttpOnly, Secure, SameSite=Strict cookie. Without the
cookie, workspace API routes stay locked.

## Storage

Set `HOME=/data` and keep `/data` persistent. This preserves both:

- `/data/.bloks` — agents, conversations, settings and workspace state
- `/data/.codex` — Codex login state

Do not commit either directory.

## Docker

```sh
docker build -t diza-ai .
docker run -d \
  --name diza-ai \
  --restart unless-stopped \
  -p 8799:8799 \
  -e DIZA_WEB_PASSWORD='use-a-long-private-password' \
  -v diza-data:/data \
  diza-ai
```

Put HTTPS in front of the container before using it over the internet.

## Codex

The image installs the official `@openai/codex` CLI. The account login
must be completed inside the runtime and its `/data/.codex` directory
must persist. DIZA will add a browser-friendly device-auth flow on top of
this branch; no OpenAI API key is baked into the image.

## Zero-cost hosting notes

A normal VM is the cleanest fit because Bloks uses Node child processes,
filesystem state and Codex CLI. Oracle Cloud's Always Free compute also
includes Always Free block storage, so the runtime and login files can
survive restarts. Northflank's Sandbox has always-on free services, but
persistent volumes are a separately metered storage resource; treat it as
a fast test host unless a persistent volume fits the account's free
allowance.
