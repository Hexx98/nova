"""
Nova Tool Runner — lightweight security tool execution service.
Replaces HexStrike. Exposes POST /api/tools/{name} returning
{"stdout": "...", "stderr": "...", "returncode": N}
"""
import logging
import subprocess

import httpx
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)

TIMEOUT = 300  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run(cmd: list, timeout: int = TIMEOUT, stdin_data: str | None = None) -> dict:
    log.info("RUN %s", " ".join(str(c) for c in cmd))
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout, input=stdin_data,
        )
        return {"stdout": r.stdout, "stderr": r.stderr, "returncode": r.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"Timed out after {timeout}s", "returncode": 124}
    except FileNotFoundError:
        return {"stdout": "", "stderr": f"Tool not found: {cmd[0]}", "returncode": 127}
    except Exception as exc:
        return {"stdout": "", "stderr": str(exc), "returncode": 1}


def d() -> dict:
    return request.json or {}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "nova-toolrunner"})


# ---------------------------------------------------------------------------
# Recon — subprocess tools
# ---------------------------------------------------------------------------

@app.post("/api/tools/subfinder")
def subfinder():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["subfinder", "-d", domain, "-silent", "-all"]))


@app.post("/api/tools/amass")
def amass():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["amass", "enum", "-passive", "-d", domain], timeout=120))


@app.post("/api/tools/httpx")
def httpx_tool():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run([
        "httpx", "-u", url, "-silent",
        "-status-code", "-title", "-tech-detect", "-follow-redirects",
    ]))


@app.post("/api/tools/naabu")
def naabu():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["naabu", "-host", domain, "-silent", "-top-ports", "1000"], timeout=120))


@app.post("/api/tools/katana")
def katana():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run(["katana", "-u", url, "-silent", "-depth", "3", "-jc"], timeout=120))


@app.post("/api/tools/hakrawler")
def hakrawler():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run(["hakrawler", "-url", url, "-depth", "3", "-insecure"], timeout=120))


@app.post("/api/tools/gau")
def gau():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["gau", "--threads", "5", domain], timeout=120))


@app.post("/api/tools/gobuster")
def gobuster():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run([
        "gobuster", "dir", "-u", url,
        "-w", "/wordlists/common.txt",
        "-q", "--no-progress", "-t", "20",
        "--wildcard",
    ], timeout=180))


@app.post("/api/tools/feroxbuster")
def feroxbuster():
    data = d()
    url = data.get("url") or data.get("target", "")
    depth = str(data.get("depth", 3))
    return jsonify(run([
        "feroxbuster", "-u", url,
        "--depth", depth, "--no-state",
        "-t", "20", "--timeout", "10",
        "--quiet",
        "-w", "/wordlists/common.txt",
    ], timeout=180))


@app.post("/api/tools/nikto")
def nikto():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run(["nikto", "-h", url, "-nointeractive", "-maxtime", "120s"], timeout=150))


@app.post("/api/tools/wafw00f")
def wafw00f():
    data = d()
    url = data.get("url") or data.get("target", "")
    return jsonify(run(["wafw00f", url]))


@app.post("/api/tools/wpscan")
def wpscan():
    data = d()
    url = data.get("url") or data.get("target", "")
    enumerate = data.get("enumerate", "vp,vt,u")
    return jsonify(run([
        "wpscan", "--url", url,
        "--no-banner", "--enumerate", enumerate,
        "--format", "cli",
    ], timeout=180))


@app.post("/api/tools/whois")
def whois():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["whois", domain], timeout=30))


@app.post("/api/tools/nmap")
def nmap():
    target = d().get("domain") or d().get("target", "")
    return jsonify(run(["nmap", "-sV", "--open", "-T4", target], timeout=180))


@app.post("/api/tools/dnsx")
def dnsx():
    domain = d().get("domain") or d().get("target", "")
    return jsonify(run(["dnsx", "-l", "/dev/stdin", "-silent", "-a", "-mx", "-ns"], timeout=60, stdin_data=domain))


@app.post("/api/tools/testssl")
def testssl():
    data = d()
    host = data.get("host") or data.get("target") or data.get("domain", "")
    return jsonify(run(["testssl.sh", "--quiet", "--color", "0", host], timeout=180))


# ---------------------------------------------------------------------------
# OSINT — HTTP-based (no binary required)
# ---------------------------------------------------------------------------

@app.post("/api/tools/crtsh")
def crtsh():
    domain = d().get("domain") or d().get("target", "")
    try:
        resp = httpx.get(f"https://crt.sh/?q=%.{domain}&output=json", timeout=30)
        entries = resp.json()
        names = sorted({e["name_value"] for e in entries if "name_value" in e})
        return jsonify({"stdout": "\n".join(names), "stderr": "", "returncode": 0})
    except Exception as exc:
        return jsonify({"stdout": "", "stderr": str(exc), "returncode": 1})


@app.post("/api/tools/wayback")
def wayback():
    domain = d().get("domain") or d().get("target", "")
    try:
        resp = httpx.get(
            "http://web.archive.org/cdx/search/cdx",
            params={
                "url": f"{domain}/*", "output": "text",
                "fl": "original", "collapse": "urlkey", "limit": "200",
            },
            timeout=30,
        )
        return jsonify({"stdout": resp.text, "stderr": "", "returncode": 0})
    except Exception as exc:
        return jsonify({"stdout": "", "stderr": str(exc), "returncode": 1})


# ---------------------------------------------------------------------------
# Exploitation tools
# ---------------------------------------------------------------------------

@app.post("/api/tools/nuclei")
def nuclei():
    data = d()
    target = data.get("url") or data.get("target", "")
    severity = data.get("severity", "")
    tags = data.get("tags", "")
    cmd = ["nuclei", "-u", target, "-silent", "-no-color"]
    if severity:
        cmd += ["-severity", severity]
    if tags:
        cmd += ["-tags", tags]
    return jsonify(run(cmd, timeout=300))


@app.post("/api/tools/sqlmap")
def sqlmap():
    data = d()
    url = data.get("url") or data.get("target", "")
    level = str(data.get("level", 1))
    risk = str(data.get("risk", 1))
    return jsonify(run([
        "sqlmap", "-u", url,
        "--batch", "--level", level, "--risk", risk,
        "--output-dir", "/tmp/sqlmap",
        "--forms", "--crawl=2",
    ], timeout=300))


@app.post("/api/tools/dalfox")
def dalfox():
    data = d()
    urls = data.get("urls") or [data.get("url") or data.get("target", "")]
    outputs = []
    for url in urls[:10]:
        r = run(["dalfox", "url", url, "--silence", "--no-color"], timeout=120)
        if r.get("stdout"):
            outputs.append(r["stdout"])
    return jsonify({"stdout": "\n".join(outputs), "stderr": "", "returncode": 0})


# ---------------------------------------------------------------------------
# Catch-all — 404 so Nova falls back to simulated data
# ---------------------------------------------------------------------------

@app.post("/api/tools/<tool_name>")
def not_implemented(tool_name):
    log.warning("Tool not implemented: %s", tool_name)
    return jsonify({"stdout": "", "stderr": f"Tool '{tool_name}' not implemented", "returncode": 127}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9000, debug=False)
