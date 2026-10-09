# DIZA LIVE / Railway Bloks Core (Free or Trial)

Only an independent Bloks Core server is deployed, not DIZA v19.
Source: official https://github.com/hamedgitty/bloks,
commit ba36e7604e5c283bbebed4e4f99d3273f92ec0ec (v2.5.32).
License: FSL-1.1-MIT. Project branch: diza-live-railway-free.

## Account and plan

Railway advertises a no-card Free Trial ($5, maximum 30 days),
then Free plan with $1/month in usage credit. A Free plan may not
cover 24/7 hosting. Volumes on Free/Trial are capped at 0.5 GB.
**Never activate Hobby or paid resources for this project without
explicit approval.** Monitor hard usage limits.

## Service settings

- Source repository: https://github.com/fatonyist92-jpg/diza-personal-ai
- Branch: diza-live-railway-free
- Builder: Dockerfile; custom Dockerfile path:
  diza-live/railway/Dockerfile
- Build context: repository root (needed for COPY paths).
- Required public domain: Railway-generated HTTPS domain.
- Server port: PORT=10000 (the image defaults to this).
- Required persistent Railway Volume: mount at /home/node/.bloks
- Required Railway environment: RAILWAY_RUN_UID=0.
  The entrypoint chowns the volume then drops privilege to node.
- Do not set BLOKS_LOOPBACK_ONLY=1.
- No public AI provider API key; add provider credentials only through
  secure server settings after a successful connection.
- Pairing code appears in **private Railway deployment logs** only,
  expires in five minutes, and is single use.
- For a new code after expiry, restart/redeploy the service, WITHOUT
  deleting the volume. Device tokens remain valid across restarts.

## Security

- Never publish pairing code or account secrets to GitHub.
- Remote Bloks API requires a device pairing token; health is public.
- The Android APK stores paired token in AndroidKeyStore.
- Avoid uploading personal documents during Stage 02 until the backend
  has been secured and proven persistent. The free tier is a pilot.
- Stateful Bloks files and the paired device-token hash live on the
  mounted volume. If the volume is removed, everything is lost.
- The service intentionally fails to start without the expected
  persistent volume mount.
- Public HTTPS + the official Bloks pairing/auth check are mandatory.
- Upstream's CLI engines may need binaries and access not supplied by
  the Bloks Docker image; verify configured engine availability before
  claiming voice AI is functional.

## CI acceptance

Use .github/workflows/diza-live-railway-qc.yml.
The job builds the Docker image and verifies:
(1) startup refused without persistent volume;
(2) health and pairing;
(3) unauthorized calls rejected;
(4) device token survives restart **with** same volume.

CI does not deploy to Railway; account connection and Free plan status
must be confirmed first. Real APK voice test still required.
