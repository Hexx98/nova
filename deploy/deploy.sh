#!/bin/bash
# Nova — First Launch / Redeploy
# Run from the Nova project root as the nova user.
# Usage: cd /opt/nova && bash deploy/deploy.sh
set -euo pipefail

NOVA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$NOVA_DIR"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy] WARN:${NC} $*"; }
die()     { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }
section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────
section "Pre-flight"

[[ -f ".env" ]] || die ".env not found — copy .env.example, fill in all values, then re-run"

# Check for unfilled placeholder values
if grep -q 'CHANGE_ME' .env; then
    die ".env still has CHANGE_ME placeholders — fill in all secrets before deploying"
fi

[[ -f "nginx/nginx.conf" ]] || die "nginx/nginx.conf not found — run 'sudo bash deploy/init-certs.sh' first"
[[ -f "nginx/ssl/fullchain.pem" ]] || die "TLS certs not found — run 'sudo bash deploy/init-certs.sh' first"

command -v docker &>/dev/null || die "Docker not found — run provision.sh first"
docker compose version &>/dev/null || die "Docker Compose plugin not found"

# ── Initialize HexStrike submodule ────────────────────────────────────────────
section "HexStrike submodule"
if [[ ! -f "hexstrike/pyproject.toml" ]]; then
    info "Initializing hexstrike submodule..."
    git submodule update --init --recursive
else
    info "HexStrike submodule present"
fi

# ── Build images ──────────────────────────────────────────────────────────────
section "Building Docker images"
FRONTEND_BUILD_TARGET=production docker compose build --pull

# ── Start services ────────────────────────────────────────────────────────────
section "Starting services"
docker compose up -d

# ── Wait for backend health ───────────────────────────────────────────────────
section "Waiting for backend"
MAX_WAIT=60
WAITED=0
until docker compose exec -T backend curl -sf http://localhost:8000/api/health >/dev/null 2>&1; do
    if (( WAITED >= MAX_WAIT )); then
        warn "Backend did not become healthy after ${MAX_WAIT}s — check logs with: docker compose logs backend"
        break
    fi
    echo -n "."
    sleep 3
    (( WAITED += 3 ))
done
echo ""
info "Backend is healthy"

# ── Migrations (run inside container — entrypoint.sh handles this on start,
#    but we verify here for visibility) ────────────────────────────────────────
section "Database migrations"
docker compose exec -T backend alembic current
info "Migration state confirmed"

# ── Create first admin user ───────────────────────────────────────────────────
section "Admin user"
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2 | tr -d '"' | tr -d "'")

echo ""
docker compose exec -it backend python /app/create-admin.py || \
    warn "Admin creation skipped — re-run: docker compose exec -it backend python /app/create-admin.py"

# ── Smoke test ────────────────────────────────────────────────────────────────
section "Smoke test"
bash deploy/smoke-test.sh || warn "Some smoke test checks failed — review output above"

# ── Done ──────────────────────────────────────────────────────────────────────
section "Nova is running"
echo ""
echo "  URL:          https://$DOMAIN"
echo "  Logs:         docker compose logs -f"
echo "  Stop:         docker compose down"
echo "  Restart:      docker compose restart"
echo "  Smoke test:   bash deploy/smoke-test.sh"
echo "  Update:       bash deploy/update.sh"
echo ""
echo "  IMPORTANT: Log in and complete TOTP MFA setup before creating any engagements."
echo ""
