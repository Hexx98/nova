#!/bin/bash
# Nova — Post-deployment Smoke Test
# Verifies all services are reachable and correctly configured after deploy.
# Usage: cd /opt/nova && bash deploy/smoke-test.sh
# Exit code: 0 = all checks passed, 1 = one or more checks failed
set -uo pipefail

NOVA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$NOVA_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $*"; (( PASS++ )); }
fail() { echo -e "  ${RED}✗${NC} $*"; (( FAIL++ )); }
warn() { echo -e "  ${YELLOW}△${NC} $*"; (( WARN++ )); }
section() { echo -e "\n${CYAN}${BOLD}── $* ──${NC}"; }

# ── Load config ───────────────────────────────────────────────────────────────
[[ -f ".env" ]] || { echo "ERROR: .env not found"; exit 1; }
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2 | tr -d '"' | tr -d "'")
[[ -n "$DOMAIN" ]] || { echo "ERROR: DOMAIN not set in .env"; exit 1; }

BASE="https://${DOMAIN}"
echo ""
echo -e "${BOLD}Nova Smoke Test${NC} — ${DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Container health ───────────────────────────────────────────────────────
section "Container health"

SERVICES=(postgres redis backend worker frontend nginx)
for SVC in "${SERVICES[@]}"; do
    STATUS=$(docker compose ps --format "{{.Service}} {{.Status}}" 2>/dev/null | grep "^${SVC} " | awk '{print $2}' || true)
    if [[ "$STATUS" == *"Up"* ]] || [[ "$STATUS" == *"healthy"* ]] || [[ "$STATUS" == *"running"* ]]; then
        pass "$SVC: $STATUS"
    elif [[ "$STATUS" == *"starting"* ]]; then
        warn "$SVC: still starting ($STATUS)"
    else
        fail "$SVC: $STATUS (expected running)"
    fi
done

# hexstrike is a dependency but may still be initializing
HSTATUS=$(docker compose ps --format "{{.Service}} {{.Status}}" 2>/dev/null | grep "^hexstrike " | awk '{print $2}' || true)
if [[ -n "$HSTATUS" ]]; then
    if [[ "$HSTATUS" == *"Up"* ]] || [[ "$HSTATUS" == *"running"* ]]; then
        pass "hexstrike: $HSTATUS"
    else
        warn "hexstrike: $HSTATUS"
    fi
else
    warn "hexstrike: not found in compose ps output"
fi

# ── 2. TLS certificate ────────────────────────────────────────────────────────
section "TLS certificate"

CERT_FILE="nginx/ssl/fullchain.pem"
if [[ ! -f "$CERT_FILE" ]]; then
    fail "cert file not found at $CERT_FILE"
else
    EXPIRY=$(openssl x509 -enddate -noout -in "$CERT_FILE" 2>/dev/null | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

    if (( DAYS_LEFT < 0 )); then
        fail "certificate EXPIRED ($EXPIRY)"
    elif (( DAYS_LEFT < 14 )); then
        warn "certificate expires in ${DAYS_LEFT} days — renew soon ($EXPIRY)"
    else
        pass "certificate valid for ${DAYS_LEFT} days (expires $EXPIRY)"
    fi

    CERT_DOMAIN=$(openssl x509 -noout -subject -in "$CERT_FILE" 2>/dev/null | grep -oP 'CN\s*=\s*\K[^\s,]+' || true)
    if [[ "$CERT_DOMAIN" == "$DOMAIN" ]] || [[ "$CERT_DOMAIN" == "*.${DOMAIN#*.}" ]]; then
        pass "certificate CN matches domain ($CERT_DOMAIN)"
    else
        fail "certificate CN mismatch: got '$CERT_DOMAIN', expected '$DOMAIN'"
    fi
fi

# ── 3. HTTP → HTTPS redirect ──────────────────────────────────────────────────
section "HTTP → HTTPS redirect"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${DOMAIN}/" 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "301" ]] || [[ "$HTTP_STATUS" == "302" ]]; then
    REDIRECT_LOC=$(curl -s -o /dev/null -w "%{redirect_url}" --max-time 10 "http://${DOMAIN}/" 2>/dev/null || true)
    pass "HTTP redirects to HTTPS ($HTTP_STATUS → $REDIRECT_LOC)"
elif [[ "$HTTP_STATUS" == "000" ]]; then
    fail "HTTP port 80 is unreachable (connection refused or timeout)"
else
    fail "HTTP returned $HTTP_STATUS instead of 301/302"
fi

# ── 4. Backend health ─────────────────────────────────────────────────────────
section "Backend health"

HEALTH_RESP=$(curl -sk --max-time 10 "${BASE}/api/health" 2>/dev/null || echo "")
HEALTH_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/api/health" 2>/dev/null || echo "000")

if [[ "$HEALTH_CODE" == "200" ]]; then
    pass "GET /api/health → 200"
    if echo "$HEALTH_RESP" | grep -q '"ok"'; then
        pass "health response contains status:ok"
    else
        fail "health response unexpected: $HEALTH_RESP"
    fi
else
    fail "GET /api/health → $HEALTH_CODE (expected 200)"
    [[ -n "$HEALTH_RESP" ]] && echo "       response: $HEALTH_RESP"
fi

# ── 5. Auth endpoints ─────────────────────────────────────────────────────────
section "Auth endpoints"

# /api/auth/me should reject unauthenticated requests
ME_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/api/auth/me" 2>/dev/null || echo "000")
if [[ "$ME_CODE" == "401" ]] || [[ "$ME_CODE" == "403" ]]; then
    pass "GET /api/auth/me → $ME_CODE (rejects unauthenticated)"
elif [[ "$ME_CODE" == "000" ]]; then
    fail "GET /api/auth/me → unreachable"
else
    fail "GET /api/auth/me → $ME_CODE (expected 401)"
fi

# Login with bad creds should return 401, not 500
LOGIN_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "${BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"smoke-test@invalid.local","password":"smoke-test-invalid"}' \
    2>/dev/null || echo "000")
if [[ "$LOGIN_CODE" == "401" ]]; then
    pass "POST /api/auth/login → 401 on bad creds (not 500)"
elif [[ "$LOGIN_CODE" == "422" ]]; then
    pass "POST /api/auth/login → 422 (validation — endpoint reachable)"
elif [[ "$LOGIN_CODE" == "429" ]]; then
    warn "POST /api/auth/login → 429 (rate limit hit — endpoint reachable)"
elif [[ "$LOGIN_CODE" == "000" ]]; then
    fail "POST /api/auth/login → unreachable"
else
    fail "POST /api/auth/login → $LOGIN_CODE (expected 401)"
fi

# API docs must be disabled in production
DOCS_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/api/docs" 2>/dev/null || echo "000")
if [[ "$DOCS_CODE" == "404" ]]; then
    pass "GET /api/docs → 404 (disabled in production)"
else
    fail "GET /api/docs → $DOCS_CODE (expected 404 — Swagger UI must be disabled in production)"
fi

# ── 6. Frontend ───────────────────────────────────────────────────────────────
section "Frontend"

FRONTEND_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/" 2>/dev/null || echo "000")
FRONTEND_BODY=$(curl -sk --max-time 10 "${BASE}/" 2>/dev/null | head -c 200 || echo "")

if [[ "$FRONTEND_CODE" == "200" ]]; then
    pass "GET / → 200"
    if echo "$FRONTEND_BODY" | grep -qi "<html"; then
        pass "frontend returns HTML"
    else
        fail "frontend response does not look like HTML"
    fi
else
    fail "GET / → $FRONTEND_CODE (expected 200)"
fi

# SPA routes should fall back to index.html (React Router)
SPA_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/engagements/test-route" 2>/dev/null || echo "000")
if [[ "$SPA_CODE" == "200" ]]; then
    pass "SPA fallback route → 200 (React Router will handle)"
else
    warn "SPA fallback route → $SPA_CODE (React Router may not handle deep links)"
fi

# ── 7. Security headers ───────────────────────────────────────────────────────
section "Security headers"

HEADERS=$(curl -sk -I --max-time 10 "${BASE}/api/health" 2>/dev/null || echo "")

check_header() {
    local NAME="$1"
    local PATTERN="$2"
    if echo "$HEADERS" | grep -qi "$PATTERN"; then
        pass "header present: $NAME"
    else
        fail "header missing: $NAME"
    fi
}

check_header "Strict-Transport-Security" "strict-transport-security"
check_header "X-Frame-Options: DENY"     "x-frame-options: deny"
check_header "X-Content-Type-Options"    "x-content-type-options: nosniff"
check_header "Content-Security-Policy"   "content-security-policy"
check_header "Referrer-Policy"           "referrer-policy"

# HSTS should include preload and includeSubDomains
HSTS_VALUE=$(echo "$HEADERS" | grep -i "strict-transport-security" | head -1 || true)
if echo "$HSTS_VALUE" | grep -qi "includesubdomains"; then
    pass "HSTS includeSubDomains set"
else
    warn "HSTS missing includeSubDomains"
fi
if echo "$HSTS_VALUE" | grep -qi "preload"; then
    pass "HSTS preload set"
else
    warn "HSTS missing preload"
fi

# ── 8. WebSocket proxy ────────────────────────────────────────────────────────
section "WebSocket proxy"

# A WS upgrade to a bad endpoint should be proxied (not a 502 from nginx).
# We expect a non-502 response — 400 or a close code from the backend is fine.
WS_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    "${BASE}/ws/engagements/00000000-0000-0000-0000-000000000000/live?token=invalid" \
    2>/dev/null || echo "000")

if [[ "$WS_CODE" == "101" ]]; then
    pass "WebSocket /ws/... → 101 Upgrade (connected, token rejected by backend)"
elif [[ "$WS_CODE" == "403" ]] || [[ "$WS_CODE" == "400" ]]; then
    pass "WebSocket /ws/... → $WS_CODE (nginx proxied, backend rejected invalid token)"
elif [[ "$WS_CODE" == "502" ]]; then
    fail "WebSocket /ws/... → 502 Bad Gateway (nginx cannot reach backend)"
elif [[ "$WS_CODE" == "000" ]]; then
    fail "WebSocket /ws/... → unreachable"
else
    warn "WebSocket /ws/... → $WS_CODE (unexpected — verify manually)"
fi

# ── 9. Database migrations ────────────────────────────────────────────────────
section "Database migrations"

ALEMBIC_OUT=$(docker compose exec -T backend alembic current 2>&1 || echo "ERROR")
if echo "$ALEMBIC_OUT" | grep -q "ERROR\|error\|failed"; then
    fail "alembic current failed: $ALEMBIC_OUT"
elif echo "$ALEMBIC_OUT" | grep -qE "[0-9a-f]{3,} \(head\)"; then
    HEAD=$(echo "$ALEMBIC_OUT" | grep -oE "[0-9a-f]{3,} \(head\)")
    pass "database at head migration: $HEAD"
else
    warn "alembic current output unexpected: $ALEMBIC_OUT"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$(( PASS + FAIL + WARN ))
echo -e "  ${GREEN}${PASS} passed${NC}   ${RED}${FAIL} failed${NC}   ${YELLOW}${WARN} warnings${NC}   (${TOTAL} total)"
echo ""

if (( FAIL > 0 )); then
    echo -e "  ${RED}${BOLD}SMOKE TEST FAILED${NC} — resolve failures before using Nova in production."
    echo ""
    exit 1
elif (( WARN > 0 )); then
    echo -e "  ${YELLOW}${BOLD}SMOKE TEST PASSED WITH WARNINGS${NC} — review warnings above."
    echo ""
    exit 0
else
    echo -e "  ${GREEN}${BOLD}ALL CHECKS PASSED${NC} — Nova is ready."
    echo ""
    exit 0
fi
