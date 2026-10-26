# ==============================================================================
# Multi-stage Production Dockerfile for Akwam Scraper (NestJS)
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy full source and compile TypeScript
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build && npm prune --production

# ==============================================================================
# Stage 2: Minimal Production Image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5000

# Install curl/wget for health check
RUN apk --no-cache add curl

# Copy production artifacts from builder
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node --from=builder /usr/src/app/public ./public

# Run as non-root user for security
USER node

EXPOSE 5000

# Health check to ensure service is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "dist/main"]
