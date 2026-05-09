# Nova — Installation Guide

Nova runs as a Docker Compose stack on any Ubuntu 22.04+ server. This guide covers deployment on a traditional VPS and on cloud-hosted VMs (AWS EC2, Azure, GCP).

The underlying steps are identical across all providers — the only differences are how you provision the VM and configure the cloud-level firewall before running Nova's scripts.

---

## Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 16 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Ports open | 22, 80, 443 | 22, 80, 443 |

You also need:
- A **domain name** pointed at the server's public IP (e.g. `nova.yourdomain.com`)
- A **GitHub account** with access to `Hexx98/nova`
- **[gh CLI](https://cli.github.com/)** or git credentials if cloning over HTTPS

> **Security note:** Nova is a penetration testing platform. Restrict port 443 to operator IP ranges at the cloud/firewall level wherever possible. Never expose it to `0.0.0.0/0` on an unmonitored server.

---

## Overview of deploy scripts

| Script | Purpose | Run as |
|---|---|---|
| `deploy/provision.sh` | One-time OS setup (Docker, UFW, certbot, nova user) | root |
| `deploy/setup-env.sh` | Interactive `.env` wizard — generates all secrets | nova |
| `deploy/init-certs.sh` | Issues Let's Encrypt TLS cert, generates nginx.conf | root |
| `deploy/deploy.sh` | Builds images, starts stack, runs migrations, creates admin | nova |
| `deploy/update.sh` | Pull latest code and redeploy | nova |
| `deploy/smoke-test.sh` | Post-deploy verification (runs automatically) | nova |

---

## Option 1 — Traditional VPS

Tested on Hetzner, DigitalOcean, Vultr, Linode, and OVH.

### 1. Create the VPS

- Choose **Ubuntu 22.04 LTS**
- Select a plan with at least 4 vCPU / 8 GB RAM
- Add your SSH public key during setup
- Note the public IPv4 address

### 2. Point DNS at the server

Create an **A record** at your DNS provider:

```
nova.yourdomain.com  →  <server public IP>
```

Wait for DNS to propagate (typically 1–5 minutes on most providers) before running certbot.

### 3. SSH in and run provisioning

```bash
ssh root@<server-ip>
curl -fsSL https://raw.githubusercontent.com/Hexx98/nova/main/deploy/provision.sh | bash
```

Or if you've already cloned the repo:

```bash
bash /opt/nova/deploy/provision.sh
```

### 4. Clone Nova and configure

```bash
su - nova
git clone --recurse-submodules https://github.com/Hexx98/nova.git /opt/nova
cd /opt/nova
bash deploy/setup-env.sh
```

### 5. Issue TLS certificate

```bash
sudo bash /opt/nova/deploy/init-certs.sh
```

### 6. Launch

```bash
cd /opt/nova
bash deploy/deploy.sh
```

Nova will be available at `https://nova.yourdomain.com` once the smoke test passes.

---

## Option 2 — AWS EC2

### 1. Launch an EC2 instance

1. Open **EC2 → Launch Instance**
2. Select **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type**
3. Choose instance type:
   - Minimum: `t3.xlarge` (4 vCPU / 16 GB)
   - Recommended: `c5.2xlarge` (8 vCPU / 16 GB) or `m5.2xlarge`
4. Under **Key pair** — select or create an SSH key pair
5. Under **Network settings → Create security group**, add inbound rules:

   | Type | Protocol | Port | Source |
   |---|---|---|---|
   | SSH | TCP | 22 | Your IP |
   | HTTP | TCP | 80 | 0.0.0.0/0 (needed for certbot) |
   | HTTPS | TCP | 443 | Your IP range (or 0.0.0.0/0) |

6. Under **Configure storage** — set root volume to at least **40 GB gp3**
7. Launch the instance

### 2. Assign an Elastic IP

EC2 public IPs change on reboot unless you use an Elastic IP:

1. **EC2 → Elastic IPs → Allocate Elastic IP address**
2. **Associate** it with your new instance
3. Note the Elastic IP address

### 3. Point DNS at the Elastic IP

```
nova.yourdomain.com  →  <elastic-ip>
```

### 4. SSH in and continue from Step 3 of the VPS guide

```bash
ssh -i your-key.pem ubuntu@<elastic-ip>
sudo -i
curl -fsSL https://raw.githubusercontent.com/Hexx98/nova/main/deploy/provision.sh | bash
```

Then follow **VPS steps 4–6** above.

---

## Option 3 — Azure Virtual Machine

### 1. Create the VM

1. **Azure Portal → Virtual Machines → Create**
2. **Image:** Ubuntu Server 22.04 LTS - x64 Gen2
3. **Size:**
   - Minimum: `Standard_D4s_v3` (4 vCPU / 16 GB)
   - Recommended: `Standard_D8s_v3` (8 vCPU / 32 GB)
4. **Authentication type:** SSH public key — paste your public key
5. **Inbound port rules:** Allow SSH (22)

### 2. Configure the Network Security Group

After the VM is created, open its **Network Security Group** and add inbound rules:

| Priority | Name | Port | Protocol | Source | Action |
|---|---|---|---|---|---|
| 100 | SSH | 22 | TCP | Your IP | Allow |
| 110 | HTTP | 80 | TCP | Any | Allow |
| 120 | HTTPS | 443 | TCP | Your IP range | Allow |

### 3. Assign a static public IP

1. Navigate to the VM's **Public IP address** resource
2. **Configuration → Assignment → Static**
3. Save — note the static IP

### 4. Point DNS

```
nova.yourdomain.com  →  <static-ip>
```

### 5. SSH in and continue from Step 3 of the VPS guide

```bash
ssh azureuser@<static-ip>
sudo -i
curl -fsSL https://raw.githubusercontent.com/Hexx98/nova/main/deploy/provision.sh | bash
```

Then follow **VPS steps 4–6** above.

---

## Option 4 — GCP Compute Engine

### 1. Create the VM instance

1. **Compute Engine → VM instances → Create Instance**
2. **Machine configuration:**
   - Series: `N2` or `C2`
   - Minimum: `n2-standard-4` (4 vCPU / 16 GB)
   - Recommended: `n2-standard-8` (8 vCPU / 32 GB)
3. **Boot disk:** Ubuntu 22.04 LTS, 40 GB+ SSD persistent disk
4. **Firewall:** Check **Allow HTTP traffic** and **Allow HTTPS traffic**
   *(This creates firewall rules tagged to the instance)*
5. Under **Security → SSH Keys** — add your public key

### 2. Reserve a static external IP

By default GCP assigns an ephemeral IP that changes on stop/start:

1. **VPC Network → IP addresses → Reserve external static address**
2. Attach it to your VM instance
3. Note the static IP

### 3. Point DNS

```
nova.yourdomain.com  →  <static-ip>
```

### 4. SSH in and continue from Step 3 of the VPS guide

```bash
gcloud compute ssh <instance-name> --zone=<your-zone>
sudo -i
curl -fsSL https://raw.githubusercontent.com/Hexx98/nova/main/deploy/provision.sh | bash
```

Then follow **VPS steps 4–6** above.

---

## First login

Once `deploy.sh` completes and the smoke test passes:

1. Browse to `https://nova.yourdomain.com`
2. Log in with the admin credentials you created
3. You will be prompted to scan a TOTP QR code — complete MFA setup before proceeding
4. Create your first engagement

---

## Updating Nova

On the server as the `nova` user:

```bash
cd /opt/nova
bash deploy/update.sh
```

This pulls the latest code, rebuilds changed images, restarts the stack, runs any new migrations, and re-runs the smoke test.

---

## Troubleshooting

**Smoke test fails on TLS check**
— DNS hasn't propagated yet, or certbot ran before DNS was live. Re-run `sudo bash deploy/init-certs.sh`.

**Backend container exits immediately**
— Check logs: `docker compose logs backend`. Usually a missing or malformed `.env` value.

**502 Bad Gateway on all routes**
— The backend container isn't healthy yet. Wait 30 seconds and retry, or check `docker compose ps` and `docker compose logs backend`.

**certbot: "Domain not found" or "DNS problem"**
— Your A record hasn't propagated. Verify with `nslookup nova.yourdomain.com` from another machine before re-running `init-certs.sh`.

**Port 80/443 unreachable after provisioning**
— UFW is active but your cloud security group / NSG may also need the ports opened. Check your cloud-level firewall rules first.

**HexStrike container fails to start**
— The submodule hasn't been initialized. Run `git submodule update --init --recursive` from `/opt/nova`, then `docker compose build hexstrike`.
