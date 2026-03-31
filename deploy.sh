#!/usr/bin/env bash
# =============================================================================
#  3reco – one-command production deploy
#
#  Usage:
#    WORKOS_API_KEY=... WORKOS_WEBHOOK_SECRET=... ./deploy.sh <domain> [workos_client_id] [workos_redirect_uri]
#
#  Example:
#    ./deploy.sh yourdomain.com
#    ./deploy.sh yourdomain.com client_XXXXXXXXXXXXXXXXXXXXXXXXXXXX https://app.yourdomain.com/callback
#
#  What it does:
#    1. Derives all service URLs from the domain you provide
#    2. Generates a secure INSTANCE_SECRET if one is not already in .env
#    3. Writes (or updates) .env
#    4. Runs: docker compose up -d --build
#
#  Prerequisites:
#    - Docker >= 24 with Compose v2
#    - DNS A records for all five subdomains pointing at this server:
#        app.<domain>
#        docs.<domain>
#        convex.<domain>
#        convex-site.<domain>
#        convex-dashboard.<domain>
# =============================================================================

set -euo pipefail

DOMAIN="${1:-}"
VITE_WORKOS_CLIENT_ID="${2:-}"
WORKOS_REDIRECT_URI_OVERRIDE="${3:-}"
VITE_WORKOS_API_HOSTNAME="${VITE_WORKOS_API_HOSTNAME:-}"
WORKOS_CLIENT_ID="${WORKOS_CLIENT_ID:-}"
WORKOS_API_KEY="${WORKOS_API_KEY:-}"
WORKOS_WEBHOOK_SECRET="${WORKOS_WEBHOOK_SECRET:-}"
WORKOS_ACTION_SECRET="${WORKOS_ACTION_SECRET:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain> [workos_client_id] [workos_redirect_uri]"
  echo "  e.g. $0 yourdomain.com client_XXXXXXXXXXXXXXXXXXXXXXXXXXXX https://app.yourdomain.com/callback"
  exit 1
fi

ENV_FILE=".env"

# ── Generate or preserve INSTANCE_SECRET ──────────────────────────────────────
# If .env already contains a non-empty INSTANCE_SECRET, keep it so existing
# Convex data remains accessible after re-deploys.
EXISTING_SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_SECRET=$(grep -E '^INSTANCE_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
fi

if [[ -n "$EXISTING_SECRET" ]]; then
  INSTANCE_SECRET="$EXISTING_SECRET"
  echo "ℹ️  Reusing existing INSTANCE_SECRET from $ENV_FILE"
else
  INSTANCE_SECRET=$(openssl rand -hex 32)
  echo "✅ Generated new INSTANCE_SECRET"
fi

EXISTING_WORKOS_CLIENT_ID=""
EXISTING_WORKOS_API_HOSTNAME=""
EXISTING_WORKOS_API_KEY=""
EXISTING_WORKOS_WEBHOOK_SECRET=""
EXISTING_WORKOS_ACTION_SECRET=""

if [[ -f "$ENV_FILE" ]]; then
  EXISTING_WORKOS_CLIENT_ID=$(grep -E '^VITE_WORKOS_CLIENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  EXISTING_WORKOS_API_HOSTNAME=$(grep -E '^VITE_WORKOS_API_HOSTNAME=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  EXISTING_WORKOS_API_KEY=$(grep -E '^WORKOS_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  EXISTING_WORKOS_WEBHOOK_SECRET=$(grep -E '^WORKOS_WEBHOOK_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  EXISTING_WORKOS_ACTION_SECRET=$(grep -E '^WORKOS_ACTION_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
fi

if [[ -n "$EXISTING_WORKOS_CLIENT_ID" ]]; then
  VITE_WORKOS_CLIENT_ID="$EXISTING_WORKOS_CLIENT_ID"
  echo "ℹ️  Reusing existing VITE_WORKOS_CLIENT_ID from $ENV_FILE"
fi

if [[ -z "$VITE_WORKOS_API_HOSTNAME" && -n "$EXISTING_WORKOS_API_HOSTNAME" ]]; then
  VITE_WORKOS_API_HOSTNAME="$EXISTING_WORKOS_API_HOSTNAME"
  echo "ℹ️  Reusing existing VITE_WORKOS_API_HOSTNAME from $ENV_FILE"
fi

if [[ -z "$VITE_WORKOS_API_HOSTNAME" ]]; then
  VITE_WORKOS_API_HOSTNAME="app.$DOMAIN"
  echo "ℹ️  Using app-domain WorkOS proxy hostname: $VITE_WORKOS_API_HOSTNAME"
fi

if [[ -z "$WORKOS_CLIENT_ID" ]]; then
  WORKOS_CLIENT_ID="$VITE_WORKOS_CLIENT_ID"
fi

if [[ -z "$WORKOS_API_KEY" && -n "$EXISTING_WORKOS_API_KEY" ]]; then
  WORKOS_API_KEY="$EXISTING_WORKOS_API_KEY"
  echo "ℹ️  Reusing existing WORKOS_API_KEY from $ENV_FILE"
fi

if [[ -z "$WORKOS_WEBHOOK_SECRET" && -n "$EXISTING_WORKOS_WEBHOOK_SECRET" ]]; then
  WORKOS_WEBHOOK_SECRET="$EXISTING_WORKOS_WEBHOOK_SECRET"
  echo "ℹ️  Reusing existing WORKOS_WEBHOOK_SECRET from $ENV_FILE"
fi

if [[ -z "$WORKOS_ACTION_SECRET" && -n "$EXISTING_WORKOS_ACTION_SECRET" ]]; then
  WORKOS_ACTION_SECRET="$EXISTING_WORKOS_ACTION_SECRET"
  echo "ℹ️  Reusing existing WORKOS_ACTION_SECRET from $ENV_FILE"
fi

DEFAULT_VITE_WORKOS_REDIRECT_URI="https://app.$DOMAIN/callback"
VITE_WORKOS_REDIRECT_URI="$DEFAULT_VITE_WORKOS_REDIRECT_URI"

if [[ -n "$WORKOS_REDIRECT_URI_OVERRIDE" ]]; then
  VITE_WORKOS_REDIRECT_URI="$WORKOS_REDIRECT_URI_OVERRIDE"
  echo "ℹ️  Using explicit VITE_WORKOS_REDIRECT_URI override: $VITE_WORKOS_REDIRECT_URI"
else
  echo "ℹ️  Using domain-derived VITE_WORKOS_REDIRECT_URI: $VITE_WORKOS_REDIRECT_URI"
fi

if [[ -z "$VITE_WORKOS_CLIENT_ID" ]]; then
  echo "⚠️  VITE_WORKOS_CLIENT_ID is not set. SSO login via WorkOS will be disabled."
else
  echo "✅ Using VITE_WORKOS_CLIENT_ID: $VITE_WORKOS_CLIENT_ID"
fi

if [[ -z "$VITE_WORKOS_API_HOSTNAME" ]]; then
  echo "⚠️  VITE_WORKOS_API_HOSTNAME is not set. Production AuthKit will fall back to api.workos.com."
else
  echo "✅ Using VITE_WORKOS_API_HOSTNAME: $VITE_WORKOS_API_HOSTNAME"
fi

if [[ -z "$WORKOS_CLIENT_ID" ]]; then
  echo "⚠️  WORKOS_CLIENT_ID is not set. Convex WorkOS auth will not initialize correctly."
else
  echo "✅ Using WORKOS_CLIENT_ID: $WORKOS_CLIENT_ID"
fi

if [[ -z "$WORKOS_API_KEY" ]]; then
  echo "⚠️  WORKOS_API_KEY is not set. Convex WorkOS auth will not initialize correctly."
else
  echo "✅ Using WORKOS_API_KEY from environment/.env"
fi

if [[ -z "$WORKOS_WEBHOOK_SECRET" ]]; then
  echo "⚠️  WORKOS_WEBHOOK_SECRET is not set. WorkOS user sync webhooks will fail."
else
  echo "✅ Using WORKOS_WEBHOOK_SECRET from environment/.env"
fi

if [[ -z "$WORKOS_ACTION_SECRET" ]]; then
  echo "ℹ️  WORKOS_ACTION_SECRET is not set. This is fine unless you enabled WorkOS actions."
else
  echo "✅ Using WORKOS_ACTION_SECRET from environment/.env"
fi

if [[ -z "$VITE_WORKOS_REDIRECT_URI" ]]; then
  echo "⚠️  VITE_WORKOS_REDIRECT_URI is not set. SSO login via WorkOS will be disabled."
else
  echo "✅ Using VITE_WORKOS_REDIRECT_URI: $VITE_WORKOS_REDIRECT_URI"
fi

# ── Write .env ─────────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# Generated by deploy.sh — do not commit this file
DOMAIN=$DOMAIN

INSTANCE_NAME=3reco-production
INSTANCE_SECRET=$INSTANCE_SECRET

CONVEX_CLOUD_ORIGIN=https://convex.$DOMAIN
CONVEX_SITE_ORIGIN=https://convex-site.$DOMAIN

VITE_CONVEX_URL=https://convex.$DOMAIN
VITE_CONVEX_AUTH_DOMAIN=https://convex-site.$DOMAIN

VITE_WORKOS_API_HOSTNAME=$VITE_WORKOS_API_HOSTNAME

WORKOS_CLIENT_ID=$WORKOS_CLIENT_ID
WORKOS_API_KEY=$WORKOS_API_KEY
WORKOS_WEBHOOK_SECRET=$WORKOS_WEBHOOK_SECRET
WORKOS_ACTION_SECRET=$WORKOS_ACTION_SECRET

VITE_WORKOS_CLIENT_ID=$VITE_WORKOS_CLIENT_ID
VITE_WORKOS_REDIRECT_URI=$VITE_WORKOS_REDIRECT_URI
EOF

echo "✅ Written $ENV_FILE for domain: $DOMAIN"

# ── Build Docker images ─────────────────────────────────────────────────────
echo ""
echo "🔧 Building Docker images..."
docker compose build --no-cache

# ── Deploy ─────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting stack..."
docker compose up -d

echo ""
echo "✅ Stack is up. Services:"
echo "   https://app.$DOMAIN"
echo "   https://docs.$DOMAIN"
echo "   https://convex.$DOMAIN"
echo "   https://convex-site.$DOMAIN"
echo "   https://convex-dashboard.$DOMAIN"
echo ""
echo "⚠️  First deploy? Generate the Convex admin key:"
echo "   docker compose exec convex-backend ./generate_admin_key.sh"
echo ""
echo "   Then deploy Convex functions:"
echo "   cd 3reco && CONVEX_SELF_HOSTED_URL=https://convex.$DOMAIN \\"
echo "     CONVEX_SELF_HOSTED_ADMIN_KEY=<key> bunx convex deploy"
