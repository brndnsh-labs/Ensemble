# syntax=docker/dockerfile:1
# Build context: prototypes/v2-api, not the repository root.
FROM node:26-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:26-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

FROM node:26-bookworm-slim AS runtime
ARG REVISION=development
LABEL org.opencontainers.image.source="https://github.com/brndnsh-labs/Ensemble" \
      org.opencontainers.image.revision="${REVISION}"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    ENSEMBLE_DB_PATH=/data/ensemble.sqlite \
    ENSEMBLE_BUILD_REVISION=${REVISION}
WORKDIR /app
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
# Fixed internal port; configure the host-side port in Compose. No auth cookies or rate bucket.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "--eval", "try { const r = await fetch('http://127.0.0.1:8080/healthz', { signal: AbortSignal.timeout(4000) }); process.exit(r.status === 200 && (await r.json()).status === 'ok' ? 0 : 1); } catch { process.exit(1); }"]
CMD ["node", "dist/server.js"]
