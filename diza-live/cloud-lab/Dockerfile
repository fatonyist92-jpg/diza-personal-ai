# Disposable Android pairing lab, pinned official Bloks source, NOT old DIZA v19.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@10
WORKDIR /opt/bloks
RUN git init . && git remote add origin https://github.com/hamedgitty/bloks.git && git fetch --depth=1 origin ba36e7604e5c283bbebed4e4f99d3273f92ec0ec && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = "ba36e7604e5c283bbebed4e4f99d3273f92ec0ec"
RUN pnpm install --frozen-lockfile
COPY diza-live/cloud-lab/boot.mjs /opt/diza-live/boot.mjs
ENV PORT=10000
EXPOSE 10000
USER node
CMD ["node", "/opt/diza-live/boot.mjs"]
