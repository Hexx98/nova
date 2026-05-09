import uuid
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.finding import Finding
from app.models.phase import Phase
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/engagements", tags=["attack-coverage"])

# ATT&CK techniques Nova exercises, keyed to the phase that exercises them.
# Ordered by tactic so the heatmap renders in kill-chain sequence.
_TECHNIQUES = [
    # ── TA0043 Reconnaissance (Phase 1) ───────────────────────────────────────
    {"id": "T1590.001", "name": "Domain Properties",        "tactic": "Reconnaissance",       "tactic_id": "TA0043", "phase": 1},
    {"id": "T1595.001", "name": "Scanning IP Blocks",       "tactic": "Reconnaissance",       "tactic_id": "TA0043", "phase": 1},
    {"id": "T1592.002", "name": "Software Fingerprinting",  "tactic": "Reconnaissance",       "tactic_id": "TA0043", "phase": 1},
    {"id": "T1595.002", "name": "Vulnerability Scanning",   "tactic": "Reconnaissance",       "tactic_id": "TA0043", "phase": 1},
    {"id": "T1593",     "name": "Search Open Websites",     "tactic": "Reconnaissance",       "tactic_id": "TA0043", "phase": 1},
    # ── TA0042 Resource Development (Phase 2) ─────────────────────────────────
    {"id": "T1588.006", "name": "Obtain: Vulnerabilities",  "tactic": "Resource Development", "tactic_id": "TA0042", "phase": 2},
    {"id": "T1588.005", "name": "Obtain: Exploits",         "tactic": "Resource Development", "tactic_id": "TA0042", "phase": 2},
    {"id": "T1587.001", "name": "Develop: Malware",         "tactic": "Resource Development", "tactic_id": "TA0042", "phase": 2},
    # ── TA0001 Initial Access (Phases 3 & 4) ──────────────────────────────────
    {"id": "T1078",     "name": "Valid Accounts",           "tactic": "Initial Access",       "tactic_id": "TA0001", "phase": 4},
    {"id": "T1190",     "name": "Exploit Public-Facing App","tactic": "Initial Access",       "tactic_id": "TA0001", "phase": 4},
    # ── TA0002 Execution (Phase 4) ─────────────────────────────────────────────
    {"id": "T1059.007", "name": "JavaScript",               "tactic": "Execution",            "tactic_id": "TA0002", "phase": 4},
    # ── TA0003 Persistence (Phase 5) ──────────────────────────────────────────
    {"id": "T1505.003", "name": "Web Shell",                "tactic": "Persistence",          "tactic_id": "TA0003", "phase": 5},
    {"id": "T1078.003", "name": "Local Accounts",           "tactic": "Persistence",          "tactic_id": "TA0003", "phase": 5},
    # ── TA0006 Credential Access (Phases 3 & 4) ───────────────────────────────
    {"id": "T1539",     "name": "Steal Web Session Cookie", "tactic": "Credential Access",    "tactic_id": "TA0006", "phase": 3},
    {"id": "T1110",     "name": "Brute Force",              "tactic": "Credential Access",    "tactic_id": "TA0006", "phase": 4},
    {"id": "T1528",     "name": "Steal App Access Token",   "tactic": "Credential Access",    "tactic_id": "TA0006", "phase": 4},
    {"id": "T1552",     "name": "Unsecured Credentials",    "tactic": "Credential Access",    "tactic_id": "TA0006", "phase": 4},
    # ── TA0007 Discovery (Phase 4) ─────────────────────────────────────────────
    {"id": "T1083",     "name": "File & Directory Discovery","tactic": "Discovery",           "tactic_id": "TA0007", "phase": 4},
    {"id": "T1518",     "name": "Software Discovery",       "tactic": "Discovery",            "tactic_id": "TA0007", "phase": 4},
    # ── TA0009 Collection (Phase 7) ───────────────────────────────────────────
    {"id": "T1005",     "name": "Data from Local System",   "tactic": "Collection",           "tactic_id": "TA0009", "phase": 7},
    {"id": "T1213",     "name": "Data from Info Repos",     "tactic": "Collection",           "tactic_id": "TA0009", "phase": 7},
    # ── TA0010 Exfiltration (Phase 7) ─────────────────────────────────────────
    {"id": "T1041",     "name": "Exfil Over C2 Channel",    "tactic": "Exfiltration",         "tactic_id": "TA0010", "phase": 7},
    # ── TA0011 Command & Control (Phases 4 & 6) ───────────────────────────────
    {"id": "T1090",     "name": "Proxy",                    "tactic": "Command & Control",    "tactic_id": "TA0011", "phase": 4},
    {"id": "T1071.001", "name": "Web Protocols",            "tactic": "Command & Control",    "tactic_id": "TA0011", "phase": 6},
    {"id": "T1102",     "name": "Web Service",              "tactic": "Command & Control",    "tactic_id": "TA0011", "phase": 6},
    {"id": "T1090.002", "name": "External Proxy",           "tactic": "Command & Control",    "tactic_id": "TA0011", "phase": 6},
]


@router.get("/{engagement_id}/attack-coverage")
async def get_attack_coverage(
    engagement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Phase statuses for this engagement
    phase_rows = await db.execute(
        select(Phase.phase_number, Phase.status).where(Phase.engagement_id == engagement_id)
    )
    phase_status: dict[int, str] = {row.phase_number: row.status for row in phase_rows}

    # Confirmed (non-FP) finding counts per technique
    confirmed_rows = await db.execute(
        select(Finding.attack_technique)
        .where(
            Finding.engagement_id == engagement_id,
            Finding.false_positive.is_(False),
            Finding.attack_technique.isnot(None),
        )
    )
    confirmed_counts: dict[str, int] = defaultdict(int)
    for row in confirmed_rows:
        confirmed_counts[row.attack_technique] += 1

    # Techniques referenced in any finding (tested, whether confirmed or not)
    all_finding_rows = await db.execute(
        select(Finding.attack_technique)
        .where(
            Finding.engagement_id == engagement_id,
            Finding.attack_technique.isnot(None),
        )
    )
    referenced_techniques = {row.attack_technique for row in all_finding_rows}

    coverage = []
    for t in _TECHNIQUES:
        t_id = t["id"]
        phase_ran = phase_status.get(t["phase"], "pending") in ("in_progress", "complete")
        count = confirmed_counts.get(t_id, 0)

        if count > 0:
            status = "confirmed"
        elif t_id in referenced_techniques:
            status = "tested"
        elif phase_ran:
            status = "tested"
        else:
            status = "not_tested"

        coverage.append({**t, "status": status, "finding_count": count})

    return coverage
