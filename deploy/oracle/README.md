# Oracle Cloud Always Free deployment

Use an Ubuntu 24.04 Always Free VM. Ampere A1 is preferred when capacity is
available; the DIZA container and Codex CLI support a normal Linux container
runtime.

Before running the installer, allow inbound TCP **80** and **443** in the
Oracle VCN/security list for the VM.

Then on the VM:

```sh
export DIZA_WEB_PASSWORD='choose-a-long-private-password'
curl -fsSL https://raw.githubusercontent.com/fatonyist92-jpg/diza-personal-ai/bloks-diza-web/deploy/oracle/install.sh -o install-diza.sh
chmod +x install-diza.sh
./install-diza.sh
```

The installer detects the VM public IPv4 address and uses
`<ip>.sslip.io` as a free DNS name. Caddy obtains and renews HTTPS
automatically. No purchased domain is required.

DIZA state and Codex login state persist in the `diza-data` Docker volume.
Caddy certificates persist in their own volumes.

After the site opens, use **Settings > Engines > Codex > Sign in**. Hosted
DIZA starts the official `codex login --device-auth` flow and shows the
ChatGPT device link/code in the UI.
