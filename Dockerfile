# syntax=docker/dockerfile:1

# ── base ─────────────────────────────────────────────────────────────
# libc6-compat is required for the native addons this project depends on
# (sharp, bufferutil, utf-8-validate) to load correctly on Alpine/musl.
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────
# Installs full dependencies (including devDependencies), needed both for
# `next build` (builder stage) and for running the voice relay servers
# directly via tsx (relay stage). PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD avoids
# downloading unused browser binaries during `npm ci`.
FROM base AS deps
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ──────────────────────────────────────────────────────────
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time,
# so they must be passed as build ARGs (docker-compose.yml supplies
# these from .env), not just runtime environment variables.
FROM deps AS builder
WORKDIR /app
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VOICE_RELAY_URL
ARG NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL
ARG NEXT_PUBLIC_VOICE_RELAY_PRIMARY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VOICE_RELAY_URL=$NEXT_PUBLIC_VOICE_RELAY_URL \
    NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL=$NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL \
    NEXT_PUBLIC_VOICE_RELAY_PRIMARY=$NEXT_PUBLIC_VOICE_RELAY_PRIMARY

# `next build` briefly imports every API route module to analyze it
# ("Collecting page data"), which runs top-level code such as the Supabase
# admin client constructor. These are build-time-only placeholders so that
# step doesn't crash on undefined env vars — real secrets are supplied at
# container start via docker-compose's `env_file: .env` in the runner stage,
# which is a separate image that does not inherit this stage's ENV.
ENV SUPABASE_URL=https://build-placeholder.supabase.co \
    SUPABASE_ANON_KEY=build-placeholder-anon-key \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder-service-role-key \
    GEMINI_API_KEY=build-placeholder

RUN npm run build

# ── runner ───────────────────────────────────────────────────────────
# Production image for the Next.js web app. Uses the trimmed
# `.next/standalone` output (see next.config.mjs `output: "standalone"`)
# so we don't need to ship full node_modules here.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

# ── relay ────────────────────────────────────────────────────────────
# Runs the standalone voice relay WebSocket servers (server/voice-relay.ts,
# server/openai-voice-relay.ts) via tsx, exactly as the repo's own
# `dev:voice` / `dev:openai-voice` npm scripts do — there is no separate
# compiled/production variant of these upstream. docker-compose.yml
# overrides `command` per service to select which relay to run.
FROM deps AS relay
WORKDIR /app
ENV NODE_ENV=production
COPY . .
CMD ["npx", "tsx", "server/voice-relay.ts"]
