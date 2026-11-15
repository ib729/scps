# syntax=docker/dockerfile:1

FROM node:26.13.1-bookworm-slim AS base

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install --global pnpm@12.21.0

WORKDIR /app/web-next

FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY web-next/package.json web-next/pnpm-lock.yaml web-next/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/web-next/node_modules ./node_modules
COPY web-next/package.json web-next/pnpm-lock.yaml web-next/pnpm-workspace.yaml web-next/tsconfig.json web-next/next-env.d.ts web-next/next.config.ts web-next/proxy.ts web-next/server.ts ./
COPY web-next/app ./app
COPY web-next/components ./components
COPY web-next/hooks ./hooks
COPY web-next/lib ./lib
COPY web-next/tools ./tools
COPY web-next/public ./public
COPY web-next/migrations ./migrations
COPY migrations /app/migrations

RUN node -e "const fs=require('fs'),D=require('better-sqlite3'),d=new D('/tmp/scps-build.db'); d.exec(fs.readFileSync('/app/migrations/schema.sql','utf8')+fs.readFileSync('migrations/better_auth_schema.sql','utf8'));d.close()" \
  && DATABASE_PATH=/tmp/scps-build.db \
     BETTER_AUTH_SECRET=scps-test-only-auth-secret-never-production-2026 \
     NFC_TAP_SECRET=scps-test-only-nfc-secret-2026 \
     NEXT_PUBLIC_APP_URL=http://localhost:3000 TRUSTED_ORIGINS=http://localhost:3000 \
     TRUST_PROXY=false NEXT_TELEMETRY_DISABLED=1 pnpm build \
  && rm -f /tmp/scps-build.db*

FROM node:26.13.1-bookworm-slim AS runner

WORKDIR /app/web-next

ENV NODE_ENV=production \
  PORT=3000 \
  NEXT_TELEMETRY_DISABLED=1

RUN npm install --global pnpm@12.21.0 \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 sqlite3 zstd rclone ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -g 1001 nodejs \
  && useradd -u 1001 -g nodejs -m nextjs

COPY --from=deps --chown=nextjs:nodejs /app/web-next/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/web-next/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/web-next/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/web-next/package.json /app/web-next/pnpm-lock.yaml /app/web-next/pnpm-workspace.yaml /app/web-next/tsconfig.json /app/web-next/next.config.ts /app/web-next/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/web-next/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/web-next/tools ./tools
COPY --from=builder --chown=nextjs:nodejs /app/web-next/app ./app
COPY --from=builder --chown=nextjs:nodejs /app/web-next/components ./components
COPY --from=builder --chown=nextjs:nodejs /app/web-next/migrations ./migrations
COPY --chown=nextjs:nodejs scripts /app/scripts
COPY --chown=nextjs:nodejs migrations /app/migrations
COPY --chown=nextjs:nodejs scps-cli /app/scps-cli

EXPOSE 3000

USER nextjs

CMD ["node", "--import", "tsx", "server.ts"]
