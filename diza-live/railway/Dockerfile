# DIZA Live / Railway persistent Bloks Core (NOT the legacy DIZA v19 shell)
# Functional Source License FSL-1.1-MIT applies to official upstream Bloks.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates gosu \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10
WORKDIR /opt/bloks
RUN git init . \
 && git remote add origin https://github.com/hamedgitty/bloks.git \
 && git fetch --depth=1 origin ba36e7604e5c283bbebed4e4f99d3273f92ec0ec \
 && git checkout --detach FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "ba36e7604e5c283bbebed4e4f99d3273f92ec0ec"
RUN pnpm install --frozen-lockfile
# Codex CLI is required by the upstream Bloks Codex app-server driver.
# Pin CLI to a published stable version, not an alpha or an unbounded latest.
RUN npm install -g @openai/codex@0.162.1 && codex --version
# Keep the original Bloks React UI, add host-only secure browser pairing,
# and fail the build if any pinned upstream source anchor has changed.
COPY diza-live/railway/patch-webview.mjs /opt/diza-live/patch-webview.mjs
COPY diza-live/railway/patch-codex.mjs /opt/diza-live/patch-codex.mjs
COPY diza-live/railway/codex-login.ts /opt/bloks/server/codex-login.ts
RUN node /opt/diza-live/patch-webview.mjs && node /opt/diza-live/patch-codex.mjs && pnpm exec vite build
COPY diza-live/railway/web/ /opt/bloks/dist/
COPY diza-live/railway/entrypoint.sh /opt/diza-live/entrypoint.sh
COPY diza-live/railway/boot.mjs /opt/diza-live/boot.mjs
RUN chmod +x /opt/diza-live/entrypoint.sh \
 && mkdir -p /home/node/.bloks \
 && chown -R node:node /home/node /opt/bloks /opt/diza-live
ENV HOME=/home/node
ENV PORT=10000
ENV BLOKS_STATIC_DIR=/opt/bloks/dist
# Share auth safely across Railway redeploys; never add an API billing key.
ENV CODEX_HOME=/home/node/.bloks/codex
EXPOSE 10000
# Railway volumes are mounted root-owned. Start briefly as root, then
# drop privileges to node before the server handles any network request.
USER root
ENTRYPOINT ["/opt/diza-live/entrypoint.sh"]
