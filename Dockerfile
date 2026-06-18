FROM alpine:latest AS base

RUN apk add --no-cache \
  nodejs \
  npm

FROM base AS deps

WORKDIR /app/web-frontend
COPY web-frontend/package.json web-frontend/package-lock.json ./
RUN npm ci

FROM deps AS builder

WORKDIR /app
COPY web-frontend ./web-frontend
COPY scripts ./scripts
COPY skills ./skills
COPY shared ./shared
COPY templates ./templates
WORKDIR /app/web-frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && node ../scripts/prepare-next-standalone.mjs .

FROM base AS runner

RUN apk add --no-cache \
  libreoffice \
  poppler-utils \
  sqlite

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  SSA_APP_ROOT=/app \
  SSA_DATA_ROOT=/app/data \
  SSA_LOCAL_GATEWAY=true \
  SSA_BETA_AUTH_REQUIRED=true \
  PORT=3000 \
  HOSTNAME=0.0.0.0

WORKDIR /app
COPY --from=builder /app/web-frontend/.next/standalone ./
RUN addgroup -S ssa \
  && adduser -S ssa -G ssa \
  && mkdir -p /app/data \
  && chown -R ssa:ssa /app

USER ssa
EXPOSE 3000

CMD ["node", "/app/scripts/local-gateway-entrypoint.mjs", "/app/server.js"]
