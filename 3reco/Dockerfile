# ─────────────────────────────────────────────
# Stage 1 – Build the React 19 + Vite app
# ─────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock ./

# Install all dependencies (includes devDeps needed for the build)
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Vite environment variables must be injected at BUILD TIME.
# Pass them via --build-arg in docker build or via docker-compose build.args.
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_AUTH_DOMAIN
ARG VITE_WORKOS_CLIENT_ID
ARG VITE_WORKOS_REDIRECT_URI

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CONVEX_AUTH_DOMAIN=$VITE_CONVEX_AUTH_DOMAIN
ENV VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID
ENV VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI

RUN bun run build

# ─────────────────────────────────────────────
# Stage 2 – Serve with nginx
# ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Drop the default nginx site config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our SPA-aware nginx config
COPY docker-nginx.conf /etc/nginx/conf.d/default.conf

# Copy static build output from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
