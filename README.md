# Nova

Automated web application penetration testing platform. Nova runs a structured kill-chain engagement against a target web app, with a human operator approving each phase transition before the next one begins.

---

## What it does

You define a target domain and scope. Nova runs each phase of the kill chain autonomously — using HexStrike as the tool execution backend — and surfaces findings, live output, and approval gates through a React dashboard. Nothing escalates without your sign-off.

---

## The phases

| # | Phase | What Nova does | Human gate |
|---|-------|----------------|------------|
| 0 | **Pre-Engagement** | Collect LoA and RoE docs, define scope, confirm authorization | Upload docs → confirm authorization → sign off |
| 1 | **Reconnaissance** | Subdomain enumeration, port scanning, tech fingerprinting, endpoint crawling. Tier 5 (aggressive) tools require explicit approval mid-phase | Review findings → approve Tier 5 if desired → sign off |
| 2 | **Weaponization** | CVE matching against discovered tech stack, attack plan generation, wordlist configuration | Review CVE report and attack plan → sign off |
| 3 | **Delivery** | Phishing simulation, payload staging, delivery vector testing (gated by RoE constraints) | Review delivery results → sign off |
| 4 | **Exploitation** | Vulnerability exploitation using the approved attack plan. Findings streamed live via WebSocket. False positives can be marked | Review all findings, mark FPs → sign off |
| 5 | **Installation** | Persistence mechanism testing — checks for privilege escalation paths, scheduled task abuse, etc. | Review persistence findings → sign off |
| 6 | **C2** | Command-and-control channel simulation — tests detection posture, lateral movement paths | Review C2 findings → sign off |
| 7 | **Actions on Objectives** | Document achieved objectives, business impact level, and write executive summary | Final sign-off → report generation unlocked |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, TanStack Query, Zustand, Tailwind |
| Backend | FastAPI (Python), async SQLAlchemy, Alembic |
| Task queue | Celery + Redis |
| Database | PostgreSQL |
| Tool execution | HexStrike AI (`Hexx98/hexstrike-ai`) — Flask, runs isolated on `nova_net` |
| Realtime | WebSockets (live phase output streamed to dashboard) |
| Auth | JWT + TOTP (required for all accounts) |
| Infra | Docker Compose, Nginx TLS termination, Let's Encrypt |

---

## Key design decisions

- **Scope enforcement** — scope entries are hashed and stored in the audit log. HexStrike rejects execution against any target not in scope.
- **No phase skipping** — phases are sequential. Each requires an explicit human sign-off before the next is unlocked.
- **Audit log** — every phase transition, tool execution, and approval is written to an immutable audit trail.
- **HexStrike isolation** — the tool execution backend has no exposed ports; it's only reachable on the internal Docker network (`nova_net`).
- **MITRE ATT&CK coverage** — findings are mapped to techniques and visualized as a heatmap per engagement.
- **Optional integrations** — Metasploit Pro RPC and Titanux (pentest management) can be connected via env vars; both are optional.

---

## Repo layout

```
backend/        FastAPI app, Celery worker, DB models, phase logic
frontend/       React dashboard
hexstrike/      Git submodule → Hexx98/hexstrike-ai (tool execution backend)
nginx/          Nginx config template (TLS termination, WS proxy)
deploy/         Provision, deploy, update, and smoke-test scripts
Documentation/  Detailed per-phase specs and architecture notes
```
