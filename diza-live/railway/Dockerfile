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
COPY diza-live/railway/entrypoint.sh /opt/diza-live/entrypoint.sh
COPY diza-live/railway/boot.mjs /opt/diza-live/boot.mjs
RUN chmod +x /opt/diza-live/entrypoint.sh \
 && mkdir -p /home/node/.bloks \
 && chown -R node:node /home/node /opt/bloks /opt/diza-live
ENV HOME=/home/node
ENV PORT=10000
EXPOSE 10000
# Railway volumes are mounted root-owned. Start briefly as root, then
# drop privileges to node before the server handles any network request.
USER root
ENTRYPOINT ["/opt/diza-live/entrypoint.sh"]
