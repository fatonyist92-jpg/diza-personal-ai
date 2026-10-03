# DIZA laptop server + HostC

This is the no-card, Rp0 deployment path.

- The laptop runs the real DIZA Node server and the official Codex CLI.
- DIZA state stays in the user's normal `~/.bloks` directory.
- Codex account state stays in `~/.codex`.
- The server binds only to `127.0.0.1:8799`.
- HostC creates an outbound HTTPS tunnel. No router port-forward is needed.
- DIZA web mode remains password-gated even though HostC rewrites public requests to look like localhost.
- The Android app stores the current HTTPS server URL and can replace it after a HostC URL change without rebuilding the APK.

## Windows

Double-click:

`deploy/local/start-diza.cmd`

The first run installs project dependencies, builds DIZA, installs the official
`@openai/codex` CLI if missing, creates a private DIZA web password under
`%USERPROFILE%\.diza\server-password.txt`, starts the local server, then starts
HostC with a QR code.

Later starts can skip the build:

`deploy\local\start-diza.cmd -SkipBuild`

## Linux/macOS

`bash deploy/local/start-diza.sh`

Use `--skip-build` after a known-good build.

## Codex

After the public DIZA page opens, sign in at Settings > Engines > Codex. DIZA
starts the official `codex login --device-auth` flow. The ChatGPT account
authorization remains a user-owned step.

## Security boundary

HostC's public URL is not a secret. DIZA therefore keeps its own strong password
gate enabled. The core server is loopback-only and does not open a LAN/WAN
listener.
