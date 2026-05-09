"""
Attack plan generation service.

Builds AI-proposed attack plans from Phase 1 recon output + CVE intelligence.
The AI plan is a structured list of AttackTask dicts covering OWASP Top 10,
MITRE ATT&CK web techniques, and CVE-specific exploitation steps.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AttackTask schema (stored as JSONB items list)
# ---------------------------------------------------------------------------
# {
#   "id": "t-<n>",
#   "category": "authentication" | "injection" | "xss" | "ssrf" | "idor" | ...
#   "technique": "Brute Force Login",
#   "description": "...",
#   "tool": "hydra" | "sqlmap" | "burp" | "nuclei" | "custom",
#   "priority": "critical" | "high" | "medium" | "low",
#   "cve_ref": "CVE-2024-XXXXX" | null,
#   "enabled": true,
#   "params": {}          # tool-specific config
# }

OWASP_CATEGORIES = [
    "broken_access_control",
    "cryptographic_failures",
    "injection",
    "insecure_design",
    "security_misconfiguration",
    "vulnerable_components",
    "authentication",
    "integrity_failures",
    "logging_failures",
    "ssrf",
]

# Base tasks always included regardless of tech stack
_BASE_TASKS: list[dict] = [
    {
        "category": "authentication",
        "technique": "Default Credentials Test",
        "description": "Test for default/common credentials on login endpoints and admin panels.",
        "tool": "hydra",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {"wordlist": "default_creds"},
    },
    {
        "category": "security_misconfiguration",
        "technique": "HTTP Security Headers Audit",
        "description": "Check for missing security headers (CSP, HSTS, X-Frame-Options, etc.).",
        "tool": "nuclei",
        "priority": "medium",
        "cve_ref": None,
        "enabled": True,
        "params": {"template_tags": ["headers", "misconfig"]},
    },
    {
        "category": "security_misconfiguration",
        "technique": "TLS/SSL Configuration Audit",
        "description": "Enumerate cipher suites, check for weak protocols (SSLv3, TLS 1.0), cert validity.",
        "tool": "testssl",
        "priority": "medium",
        "cve_ref": None,
        "enabled": True,
        "params": {},
    },
    {
        "category": "broken_access_control",
        "technique": "Forced Browsing / Directory Traversal",
        "description": "Enumerate hidden paths, backup files, and admin interfaces.",
        "tool": "feroxbuster",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {"wordlist": "raft_medium_directories"},
    },
    {
        "category": "injection",
        "technique": "SQL Injection Discovery",
        "description": "Automated SQLi scanning on all discovered parameters.",
        "tool": "sqlmap",
        "priority": "critical",
        "cve_ref": None,
        "enabled": True,
        "params": {"risk": 2, "level": 3},
    },
    {
        "category": "xss",
        "technique": "Reflected / Stored XSS",
        "description": "Fuzz input fields and URL parameters for cross-site scripting.",
        "tool": "nuclei",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {"template_tags": ["xss"]},
    },
    {
        "category": "ssrf",
        "technique": "SSRF via URL Parameters",
        "description": "Test URL-accepting parameters for server-side request forgery.",
        "tool": "nuclei",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {"template_tags": ["ssrf"]},
    },
    {
        "category": "broken_access_control",
        "technique": "IDOR / Horizontal Privilege Escalation",
        "description": "Test object reference parameters (IDs, UUIDs) for authorization bypass.",
        "tool": "burp",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {},
    },
    {
        "category": "integrity_failures",
        "technique": "JWT / Session Token Analysis",
        "description": "Test for weak JWT secrets, algorithm confusion (alg:none), session fixation.",
        "tool": "jwt_tool",
        "priority": "high",
        "cve_ref": None,
        "enabled": True,
        "params": {},
    },
    {
        "category": "logging_failures",
        "technique": "Error Handling / Verbose Responses",
        "description": "Trigger error conditions and inspect responses for stack traces, internal paths, or version strings.",
        "tool": "custom",
        "priority": "medium",
        "cve_ref": None,
        "enabled": True,
        "params": {},
    },
]

# Tech-stack-specific task templates
_TECH_TASKS: dict[str, list[dict]] = {
    "wordpress": [
        {
            "category": "vulnerable_components",
            "technique": "WordPress Plugin/Theme Enumeration",
            "description": "Enumerate installed WordPress plugins and themes; check versions against known CVEs.",
            "tool": "wpscan",
            "priority": "critical",
            "cve_ref": None,
            "enabled": True,
            "params": {"enumerate": "vp,vt,u"},
        },
        {
            "category": "authentication",
            "technique": "WordPress User Enumeration + Brute Force",
            "description": "Enumerate WordPress usernames via REST API then brute-force wp-login.",
            "tool": "wpscan",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {"enumerate": "u", "brute_force": True},
        },
        {
            "category": "broken_access_control",
            "technique": "WordPress REST API Exposure",
            "description": "Check /wp-json/ for unauthenticated data disclosure and writable endpoints.",
            "tool": "nuclei",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["wordpress"]},
        },
    ],
    "apache": [
        {
            "category": "security_misconfiguration",
            "technique": "Apache mod_status / Server Info Exposure",
            "description": "Check /server-status and /server-info for unauthenticated access.",
            "tool": "nuclei",
            "priority": "medium",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["apache", "exposure"]},
        },
        {
            "category": "injection",
            "technique": "Apache Path Traversal (mod_rewrite)",
            "description": "Test for path traversal via encoded sequences in mod_rewrite rules.",
            "tool": "nuclei",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["apache", "lfi"]},
        },
    ],
    "nginx": [
        {
            "category": "security_misconfiguration",
            "technique": "Nginx Alias Traversal",
            "description": "Test for alias directive misconfiguration allowing path traversal.",
            "tool": "nuclei",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["nginx"]},
        },
    ],
    "php": [
        {
            "category": "injection",
            "technique": "PHP Object Injection",
            "description": "Test deserialization endpoints for PHP object injection via crafted payloads.",
            "tool": "custom",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {},
        },
        {
            "category": "injection",
            "technique": "Local / Remote File Inclusion",
            "description": "Test file path parameters for LFI/RFI vulnerabilities.",
            "tool": "nuclei",
            "priority": "critical",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["lfi", "rfi"]},
        },
    ],
    "jquery": [
        {
            "category": "vulnerable_components",
            "technique": "jQuery Version CVE Check",
            "description": "Confirm jQuery version and test for known XSS/prototype pollution CVEs.",
            "tool": "nuclei",
            "priority": "medium",
            "cve_ref": "CVE-2020-11022",
            "enabled": True,
            "params": {"template_tags": ["jquery"]},
        },
    ],
    "drupal": [
        {
            "category": "vulnerable_components",
            "technique": "Drupalgeddon Scan",
            "description": "Test for Drupalgeddon 2/3 RCE and other critical Drupal CVEs.",
            "tool": "nuclei",
            "priority": "critical",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["drupal"]},
        },
    ],
    "joomla": [
        {
            "category": "vulnerable_components",
            "technique": "Joomla Component Scan",
            "description": "Enumerate Joomla components and check for known RCE/SQLi vulnerabilities.",
            "tool": "nuclei",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["joomla"]},
        },
    ],
    "tomcat": [
        {
            "category": "authentication",
            "technique": "Tomcat Manager Default Credentials",
            "description": "Attempt default credentials on Tomcat Manager and Host Manager interfaces.",
            "tool": "nuclei",
            "priority": "critical",
            "cve_ref": None,
            "enabled": True,
            "params": {"template_tags": ["tomcat", "default-login"]},
        },
    ],
    "graphql": [
        {
            "category": "broken_access_control",
            "technique": "GraphQL Introspection + Batching Attack",
            "description": "Test introspection exposure, query batching for DoS, and field-level auth bypass.",
            "tool": "custom",
            "priority": "high",
            "cve_ref": None,
            "enabled": True,
            "params": {},
        },
    ],
}


def _tasks_for_cves(cve_report: dict[str, Any]) -> list[dict]:
    """Generate targeted tasks from CVE report entries."""
    tasks = []
    by_tech = cve_report.get("by_technology", {})

    for tech, cves in by_tech.items():
        for cve in cves:
            if cve.get("severity") in ("critical", "high"):
                tasks.append({
                    "category": "vulnerable_components",
                    "technique": f"CVE Exploit: {cve['cve_id']}",
                    "description": f"{cve['description'][:200]} (CVSS: {cve.get('cvss_score', 'N/A')})",
                    "tool": "nuclei",
                    "priority": cve.get("severity", "high"),
                    "cve_ref": cve["cve_id"],
                    "enabled": True,
                    "params": {"cve_id": cve["cve_id"]},
                })

    return tasks[:10]  # cap to avoid bloated plans


def generate_attack_plan(
    tech_stack: list[str],
    cve_report: dict[str, Any],
    scope_hosts: list[str],
) -> list[dict]:
    """
    Build an AI-proposed attack plan from tech stack and CVE data.
    Returns a list of AttackTask dicts with sequential IDs.
    """
    tasks: list[dict] = []

    # 1. Base tasks always apply
    tasks.extend(_BASE_TASKS)

    # 2. Tech-specific tasks
    seen_techniques: set[str] = {t["technique"] for t in tasks}
    for tech in tech_stack:
        tech_lower = tech.lower()
        for key, tech_task_list in _TECH_TASKS.items():
            if key in tech_lower:
                for task in tech_task_list:
                    if task["technique"] not in seen_techniques:
                        tasks.append(task)
                        seen_techniques.add(task["technique"])

    # 3. CVE-targeted tasks
    cve_tasks = _tasks_for_cves(cve_report)
    for task in cve_tasks:
        if task["technique"] not in seen_techniques:
            tasks.append(task)
            seen_techniques.add(task["technique"])

    # 4. Assign sequential IDs and copy to avoid mutating templates
    numbered = []
    for i, task in enumerate(tasks, start=1):
        t = dict(task)
        t["id"] = f"t-{i:03d}"
        t["params"] = dict(task.get("params", {}))
        numbered.append(t)

    # Sort: critical → high → medium → low
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    numbered.sort(key=lambda x: priority_order.get(x["priority"], 9))

    # Re-assign IDs after sort
    for i, t in enumerate(numbered, start=1):
        t["id"] = f"t-{i:03d}"

    return numbered


def summarize_plan(items: list[dict]) -> dict[str, Any]:
    """Return high-level stats for display in the UI."""
    by_priority: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_category: dict[str, int] = {}
    cve_tasks = 0

    for t in items:
        if not t.get("enabled", True):
            continue
        p = t.get("priority", "medium")
        by_priority[p] = by_priority.get(p, 0) + 1
        cat = t.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + 1
        if t.get("cve_ref"):
            cve_tasks += 1

    return {
        "total_tasks": sum(1 for t in items if t.get("enabled", True)),
        "by_priority": by_priority,
        "by_category": by_category,
        "cve_targeted_tasks": cve_tasks,
    }
