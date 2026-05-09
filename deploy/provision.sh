#!/bin/bash
# Nova VPS Provisioning — run once on a fresh Ubuntu 22.04+ server as root.
# Usage: curl -fsSL https://raw.githubusercontent.com/Hexx98/nova/main/deploy/provision.sh | sudo bash
set -euo pipefail

NOVA_USER="nova"
MIN_RAM_GB=8
MIN_CPU=4

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${GREEN}[provision]${NC} $*"; }
warn()    { echo -e "${YELLOW}[provision] WARN:${NC} $*"; }
die()     { echo -e "${RED}[provision] ERROR:${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo bash provision.sh)"

# ── System check ──────────────────────────────────────────────────────────────
info "Checking system resources..."
RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
CPU_COUNT=$(nproc)
if (( RAM_GB < MIN_RAM_GB )); then
    warn "Only ${RAM_GB}GB RAM detected. ${MIN_RAM_GB}GB+ recommended for HexStrike."
fi
if (( CPU_COUNT < MIN_CPU )); then
    warn "Only ${CPU_COUNT} vCPUs detected. ${MIN_CPU}+ recommended for concurrent tool runs."
fi

# ── System update ─────────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# ── Docker CE ─────────────────────────────────────────────────────────────────
info "Installing Docker CE..."
if command -v docker &>/dev/null; then
    info "Docker already installed ($(docker --version))"
else
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    info "Docker installed: $(docker --version)"
fi

# ── Certbot ───────────────────────────────────────────────────────────────────
info "Installing Certbot..."
if command -v certbot &>/dev/null; then
    info "Certbot already installed"
else
    apt-get install -y -qq certbot
    info "Certbot installed: $(certbot --version)"
fi

# ── Git ───────────────────────────────────────────────────────────────────────
info "Installing Git..."
apt-get install -y -qq git

# ── Nova system user ──────────────────────────────────────────────────────────
info "Creating user '$NOVA_USER'..."
if id "$NOVA_USER" &>/dev/null; then
    info "User '$NOVA_USER' already exists"
else
    useradd -m -s /bin/bash "$NOVA_USER"
    info "User '$NOVA_USER' created"
fi
usermod -aG docker "$NOVA_USER"
info "Added '$NOVA_USER' to docker group"

# ── Firewall (UFW) ────────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP (certbot + redirect)"
ufw allow 443/tcp  comment "HTTPS (Nova)"
ufw --force enable
info "UFW active:"
ufw status verbose

# ── App directory ─────────────────────────────────────────────────────────────
info "Creating /opt/nova..."
mkdir -p /opt/nova
chown "$NOVA_USER:$NOVA_USER" /opt/nova

# ── Cert renewal cron ─────────────────────────────────────────────────────────
info "Setting up certbot renewal cron..."
RENEW_CRON="0 3 * * * certbot renew --quiet --deploy-hook '/opt/nova/deploy/renew-hook.sh'"
(crontab -l 2>/dev/null | grep -v certbot; echo "$RENEW_CRON") | crontab -

mkdir -p /opt/nova/deploy
cat > /opt/nova/deploy/renew-hook.sh << 'HOOK'
#!/bin/bash
# Called by certbot after successful renewal — copies new certs and reloads nginx.
NOVA_DIR="/opt/nova"
DOMAIN_DIR=$(ls /etc/letsencrypt/live/ | grep -v README | head -1)
cp /etc/letsencrypt/live/$DOMAIN_DIR/fullchain.pem "$NOVA_DIR/nginx/ssl/fullchain.pem"
cp /etc/letsencrypt/live/$DOMAIN_DIR/privkey.pem   "$NOVA_DIR/nginx/ssl/privkey.pem"
chmod 600 "$NOVA_DIR/nginx/ssl/privkey.pem"
cd "$NOVA_DIR" && docker compose exec -T nginx nginx -s reload
HOOK
chmod +x /opt/nova/deploy/renew-hook.sh
chown -R "$NOVA_USER:$NOVA_USER" /opt/nova

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "Provisioning complete."
echo ""
echo "  Next steps:"
echo "  1. Log in as the nova user:   su - nova"
echo "  2. Clone the repo:            git clone --recurse-submodules <YOUR_NOVA_REPO_URL> /opt/nova"
echo "  3. Configure .env:            cd /opt/nova && bash deploy/setup-env.sh"
echo "  4. Issue TLS certificate:     sudo bash /opt/nova/deploy/init-certs.sh"
echo "  5. First launch:              cd /opt/nova && bash deploy/deploy.sh"
echo ""
