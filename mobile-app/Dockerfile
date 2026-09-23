# ==============================================================================
# TIPS Beauty — Multi-Stage Dockerfile
# Supports Development & Production Deployments
# ==============================================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# --- Dependencies Stage ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Development / Runner Stage ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=development
ENV EXPO_USE_METRO_WORKSPACE_ROOT=1
ENV PORT=8081

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 8081 3000

CMD ["pnpm", "dev:metro"]
