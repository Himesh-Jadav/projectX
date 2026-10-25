# Stage 1: Build Frontend Assets
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/

RUN npm ci && cd web && npm ci

# Copy full source tree needed for web build
COPY server ./server
COPY web ./web

# Build frontend production bundle into web/dist
RUN npm run build:web

# Stage 2: Production Server Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy dependency manifests and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server application
COPY server ./server

# Copy compiled frontend from builder
COPY --from=builder /app/web/dist ./web/dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose server port (serves both API and frontend UI)
EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
