#!/bin/bash
# Nova — Initial TLS Certificate Issuance via Let's Encrypt
# Run as root after provisioning, before the first docker compose up.
# Requires: DOMAIN and CERTBOT_EMAIL set in /opt/nova/.env
set -euo pipefail

NOVA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$NOVA_DIR/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info() { echo -e "${GREEN}[init-certs]${NC} $*"; }
die()  { echo -e "${RED}[init-certs] ERROR:${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo bash deploy/init-certs.sh)"
[[ -f "$ENV_FILE" ]] || die ".env not found at $ENV_FILE — copy .env.example and fill it in first"
command -v certbot &>/dev/null || die "certbot not installed — run provision.sh first"

# Load DOMAIN and CERTBOT_EMAIL from .env
DOMAIN=$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
EMAIL=$(grep -E '^CERTBOT_EMAIL=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")

[[ -n "$DOMAIN" ]] || die "DOMAIN is not set in .env"
[[ -n "$EMAIL" ]] || die "CERTBOT_EMAIL is not set in .env"

info "Issuing certificate for $DOMAIN (contact: $EMAIL)..."

# Stop anything on port 80 so certbot standalone can bind
if ss -tlnp | grep -q ':80 '; then
    info "Port 80 is in use — attempting to stop nginx container..."
    cd "$NOVA_DIR" && docker compose stop nginx 2>/dev/null || true
    sleep 2
fi

# Issue cert via certbot standalone
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    --rsa-key-size 4096

info "Certificate issued."

# Copy certs into the Nova nginx ssl directory
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
SSL_DIR="$NOVA_DIR/nginx/ssl"

mkdir -p "$SSL_DIR"
cp "$CERT_DIR/fullchain.pem" "$SSL_DIR/fullchain.pem"
cp "$CERT_DIR/privkey.pem"   "$SSL_DIR/privkey.pem"
chmod 644 "$SSL_DIR/fullchain.pem"
chmod 600 "$SSL_DIR/privkey.pem"

# Generate nginx.conf from template, substituting the domain
TEMPLATE="$NOVA_DIR/nginx/nginx.conf.template"
CONF="$NOVA_DIR/nginx/nginx.conf"
[[ -f "$TEMPLATE" ]] || die "nginx.conf.template not found at $TEMPLATE"

DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < "$TEMPLATE" > "$CONF"
info "nginx.conf generated at $CONF"

# Fix ownership so nova user can read
chown -R nova:nova "$SSL_DIR" "$CONF" 2>/dev/null || true

info "TLS certificate setup complete."
echo ""
echo "  Certs copied to:  $SSL_DIR"
echo "  nginx.conf:       $CONF"
echo ""
echo "  Run 'bash deploy/deploy.sh' to start Nova."
echo ""
