# syntax=docker/dockerfile:1

FROM node:26.13.1-bookworm-slim AS base

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install --global pnpm@12.21.0

WORKDIR /app

FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

FROM node:26.13.1-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
  PORT=3000 \
  NEXT_TELEMETRY_DISABLED=1

RUN npm install --global pnpm@12.21.0 \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r nodejs \
  && useradd -r -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.next/static ./.next/static
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

USER nextjs

CMD ["node", "server.js"]
