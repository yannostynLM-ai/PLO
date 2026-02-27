# =============================================================================
# PLO — Multi-stage Docker build
# =============================================================================

# ── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Install all dependencies (cached layer)
# NODE_TLS_REJECT_UNAUTHORIZED=0 only needed behind corporate proxy
COPY package.json pnpm-lock.yaml ./
ARG NODE_TLS_REJECT_UNAUTHORIZED=1
RUN NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED} pnpm install --frozen-lockfile

# Generate Prisma client
COPY prisma ./prisma
RUN NODE_TLS_REJECT_UNAUTHORIZED=${NODE_TLS_REJECT_UNAUTHORIZED} pnpm prisma generate

# Compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Prune to production deps (keeps generated Prisma client in node_modules)
RUN pnpm prune --prod

# ── Stage 2 : Production runtime ─────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy pruned node_modules (includes generated Prisma client), compiled JS, and prisma schema
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/main.js"]
