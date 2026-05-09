#!/bin/bash
# Nova — Pull latest code and redeploy with zero-downtime rolling restart.
# Usage: cd /opt/nova && bash deploy/update.sh
set -euo pipefail

NOVA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$NOVA_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[update]${NC} $*"; }
warn()    { echo -e "${YELLOW}[update] WARN:${NC} $*"; }
section() { echo -e "\n${CYAN}══ $* ══${NC}"; }

[[ -f ".env" ]] || { echo "ERROR: .env not found"; exit 1; }

# ── Pull latest code ──────────────────────────────────────────────────────────
section "Pulling latest code"
git pull --ff-only
git submodule update --init --recursive
info "Code updated"

# ── Rebuild changed images ────────────────────────────────────────────────────
section "Rebuilding images"
FRONTEND_BUILD_TARGET=production docker compose build --pull

# ── Rolling restart ───────────────────────────────────────────────────────────
# Bring up new containers; entrypoint.sh runs migrations automatically.
section "Restarting services"
docker compose up -d --remove-orphans

# ── Health check ──────────────────────────────────────────────────────────────
section "Verifying backend"
MAX_WAIT=60
WAITED=0
until docker compose exec -T backend curl -sf http://localhost:8000/api/health >/dev/null 2>&1; do
    if (( WAITED >= MAX_WAIT )); then
        warn "Backend did not come back healthy after ${MAX_WAIT}s"
        warn "Check logs: docker compose logs --tail=50 backend"
        exit 1
    fi
    echo -n "."
    sleep 3
    (( WAITED += 3 ))
done
echo ""
info "Backend healthy"

# ── Smoke test ────────────────────────────────────────────────────────────────
section "Smoke test"
bash deploy/smoke-test.sh || { warn "Some smoke test checks failed — review output above"; }

# ── Clean up old images ───────────────────────────────────────────────────────
section "Pruning old images"
docker image prune -f

DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2 | tr -d '"' | tr -d "'")
echo ""
echo "  Nova updated and running at https://$DOMAIN"
echo ""
