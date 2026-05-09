"""
Parse raw tool output lines into Finding dicts.

Each tool has a dedicated parser. If the line doesn't match,
the parser returns None and the line is skipped.
"""
from __future__ import annotations

import json
import re
from typing import Any

# ---------------------------------------------------------------------------
# Nuclei JSON output
# Nuclei -json produces one JSON object per line
# ---------------------------------------------------------------------------

def _parse_nuclei_line(line: str) -> dict | None:
    try:
        obj = json.loads(line.strip())
    except (ValueError, TypeError):
        return None

    info = obj.get("info", {})
    severity = info.get("severity", "info").lower()
    name     = info.get("name", obj.get("template-id", "Nuclei Finding"))
    matched  = obj.get("matched-at") or obj.get("host") or ""
    desc     = info.get("description") or name
    template = obj.get("template-id", "")
    cve_list = [t for t in info.get("tags", []) if t.upper().startswith("CVE-")]

    return {
        "title":          name,
        "url":            matched,
        "severity":       severity if severity in ("critical", "high", "medium", "low") else "info",
        "description":    desc[:2000],
        "evidence":       json.dumps(obj, indent=2)[:3000],
        "tool":           "nuclei",
        "cve_ids":        cve_list or None,
        "owasp_category": _nuclei_owasp(info.get("classification", {}).get("owasp-api", [])),
    }


def _nuclei_owasp(tags: list[str]) -> str | None:
    if not tags:
        return None
    mapping = {
        "api1": "broken_access_control",
        "api2": "authentication",
        "api3": "injection",
        "api7": "security_misconfiguration",
        "api10": "ssrf",
    }
    for tag in tags:
        for k, v in mapping.items():
            if k in tag.lower():
                return v
    return None


# ---------------------------------------------------------------------------
# SQLMap text output
# ---------------------------------------------------------------------------

_SQLMAP_PARAM_RE = re.compile(
    r"Parameter:\s+(?P<param>\S+).*?Type:\s+(?P<type>[^\n]+)",
    re.DOTALL,
)
_SQLMAP_URL_RE = re.compile(r"testing URL '(.+?)'")


def _parse_sqlmap_line(line: str, _state: dict) -> dict | None:
    """
    SQLMap outputs multi-line blocks; we buffer URL + first vuln line.
    We only produce a finding when we see an injection confirmation.
    """
    if "testing URL" in line:
        m = _SQLMAP_URL_RE.search(line)
        if m:
            _state["url"] = m.group(1)
        return None

    if "is vulnerable" in line.lower() or "sql injection" in line.lower():
        url = _state.get("url", "")
        return {
            "title":       "SQL Injection",
            "url":         url,
            "severity":    "critical",
            "description": line.strip()[:1000],
            "evidence":    line.strip()[:2000],
            "tool":        "sqlmap",
            "owasp_category": "injection",
            "cve_ids":     None,
        }

    if "Type:" in line and "Parameter:" in line:
        url = _state.get("url", "")
        return {
            "title":       "SQL Injection Parameter",
            "url":         url,
            "severity":    "critical",
            "description": line.strip()[:500],
            "evidence":    line.strip(),
            "tool":        "sqlmap",
            "owasp_category": "injection",
            "cve_ids":     None,
        }

    return None


# ---------------------------------------------------------------------------
# Dalfox (XSS) JSON output
# ---------------------------------------------------------------------------

def _parse_dalfox_line(line: str) -> dict | None:
    """Dalfox -format json produces one JSON object per finding."""
    try:
        obj = json.loads(line.strip())
    except (ValueError, TypeError):
        return None

    if "param" not in obj and "data" not in obj:
        return None

    return {
        "title":          f"XSS — {obj.get('param', 'unknown parameter')}",
        "url":            obj.get("data", {}).get("url") or obj.get("url", ""),
        "severity":       "high",
        "description":    f"Reflected XSS via parameter '{obj.get('param','?')}'. "
                          f"Payload: {obj.get('payload','N/A')}",
        "evidence":       json.dumps(obj, indent=2)[:2000],
        "tool":           "dalfox",
        "owasp_category": "xss",
        "cve_ids":        None,
    }


# ---------------------------------------------------------------------------
# Feroxbuster / directory brute-force
# ---------------------------------------------------------------------------

_FERRO_RE = re.compile(r"^(?P<status>\d{3})\s+\S+\s+\S+\s+(?P<url>https?://\S+)")


def _parse_feroxbuster_line(line: str) -> dict | None:
    m = _FERRO_RE.match(line.strip())
    if not m:
        return None
    status = int(m.group("status"))
    url    = m.group("url")
    # Only report interesting status codes
    if status not in (200, 201, 204, 301, 302, 403, 500):
        return None
    if status == 403:
        return {
            "title":          f"Forbidden Path Discovered: {url.split('/')[-1]}",
            "url":            url,
            "severity":       "low",
            "description":    f"Path {url} returns 403 — may be accessible via bypass.",
            "evidence":       line.strip(),
            "tool":           "feroxbuster",
            "owasp_category": "broken_access_control",
            "cve_ids":        None,
        }
    return None  # 200s logged but not automatically raised as findings


# ---------------------------------------------------------------------------
# Simulated findings for dev mode (per attack category)
# ---------------------------------------------------------------------------

_SIMULATED: dict[str, list[dict]] = {
    "injection": [
        {
            "title": "SQL Injection — id Parameter",
            "url": "{target}/api/users?id=1",
            "severity": "critical",
            "description": "Boolean-based blind SQL injection detected on parameter 'id'. "
                           "Attacker can enumerate the full database schema.",
            "evidence": "Parameter: id (GET)\nType: boolean-based blind\nTitle: AND boolean-based blind",
            "tool": "sqlmap",
            "owasp_category": "injection",
            "cve_ids": None,
        },
    ],
    "xss": [
        {
            "title": "Reflected XSS — q Parameter",
            "url": "{target}/search?q=<script>",
            "severity": "high",
            "description": "Reflected XSS in search parameter 'q'. No output encoding applied.",
            "evidence": "<script>alert(1)</script> reflected unescaped in response.",
            "tool": "dalfox",
            "owasp_category": "xss",
            "cve_ids": None,
        },
    ],
    "authentication": [
        {
            "title": "Default Credentials — Admin Panel",
            "url": "{target}/admin",
            "severity": "critical",
            "description": "Admin panel accessible with default credentials admin:admin.",
            "evidence": "HTTP 200 on POST /admin/login with username=admin&password=admin",
            "tool": "hydra",
            "owasp_category": "authentication",
            "cve_ids": None,
        },
    ],
    "security_misconfiguration": [
        {
            "title": "Missing Content-Security-Policy Header",
            "url": "{target}/",
            "severity": "medium",
            "description": "Content-Security-Policy header is not set, increasing XSS risk.",
            "evidence": "HTTP response headers: no Content-Security-Policy found.",
            "tool": "nuclei",
            "owasp_category": "security_misconfiguration",
            "cve_ids": None,
        },
        {
            "title": "Server Version Disclosure",
            "url": "{target}/",
            "severity": "low",
            "description": "Server header exposes version information: nginx/1.24.0",
            "evidence": "Server: nginx/1.24.0",
            "tool": "nuclei",
            "owasp_category": "security_misconfiguration",
            "cve_ids": None,
        },
    ],
    "broken_access_control": [
        {
            "title": "IDOR — User Profile Access",
            "url": "{target}/api/users/2",
            "severity": "high",
            "description": "Authenticated user can access other users' profile data "
                           "by incrementing the id parameter.",
            "evidence": "GET /api/users/2 as user ID 1 returns 200 with full profile data.",
            "tool": "burp",
            "owasp_category": "broken_access_control",
            "cve_ids": None,
        },
    ],
    "ssrf": [
        {
            "title": "SSRF via URL Parameter",
            "url": "{target}/fetch?url=",
            "severity": "high",
            "description": "Server-side request forgery via url parameter — internal "
                           "host metadata accessible.",
            "evidence": "GET /fetch?url=http://169.254.169.254/latest/meta-data/ returns 200",
            "tool": "nuclei",
            "owasp_category": "ssrf",
            "cve_ids": None,
        },
    ],
    "vulnerable_components": [
        {
            "title": "Outdated jQuery Version (1.11.3)",
            "url": "{target}/static/app.js",
            "severity": "medium",
            "description": "jQuery 1.11.3 is vulnerable to XSS via $.html() (CVE-2020-11022).",
            "evidence": "jQuery v1.11.3 detected in /static/app.js",
            "tool": "nuclei",
            "owasp_category": "vulnerable_components",
            "cve_ids": ["CVE-2020-11022"],
        },
    ],
    "integrity_failures": [
        {
            "title": "Weak JWT Secret",
            "url": "{target}/api/auth/login",
            "severity": "critical",
            "description": "JWT token signed with a weak/common secret ('secret'). "
                           "Tokens can be forged.",
            "evidence": "JWT header alg=HS256; secret cracked via dictionary attack.",
            "tool": "jwt_tool",
            "owasp_category": "integrity_failures",
            "cve_ids": None,
        },
    ],
}


def simulated_findings_for_task(category: str, target: str) -> list[dict]:
    """Return dev-mode findings for a given attack category."""
    items = _SIMULATED.get(category, [])
    result = []
    for item in items:
        f = dict(item)
        f["url"] = f["url"].replace("{target}", f"https://{target}")
        result.append(f)
    return result


# ---------------------------------------------------------------------------
# Public dispatch
# ---------------------------------------------------------------------------

def parse_line(tool: str, line: str, state: dict) -> dict | None:
    """
    Parse one output line from the given tool.
    `state` is a mutable dict for cross-line context (e.g. current URL in sqlmap).
    Returns a finding dict or None.
    """
    if tool == "nuclei":
        return _parse_nuclei_line(line)
    if tool == "sqlmap":
        return _parse_sqlmap_line(line, state)
    if tool == "dalfox":
        return _parse_dalfox_line(line)
    if tool == "feroxbuster":
        return _parse_feroxbuster_line(line)
    return None
