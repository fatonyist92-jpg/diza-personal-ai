FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /src
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm build:server

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @openai/codex

WORKDIR /opt/diza
COPY --from=build /src/dist ./dist
COPY --from=build /src/dist-server ./dist-server
COPY LICENSE ./LICENSE
COPY LICENSING.md ./LICENSING.md

ENV NODE_ENV=production
ENV HOME=/data
ENV BLOKS_STATIC_DIR=/opt/diza/dist
ENV DIZA_WEB_MODE=1
ENV PORT=8799

RUN mkdir -p /data/.bloks /data/.codex
VOLUME ["/data"]

EXPOSE 8799
CMD ["node", "dist-server/index.js"]
