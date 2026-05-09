"""
Phase 1 — Reconnaissance tier and tool configuration.
Mirrors the tool groups defined in PHASE_1_RECON.md.
"""
from typing import TypedDict


class ToolDef(TypedDict):
    name: str
    description: str
    hexstrike_tool: str   # HexStrike tool identifier
    enabled_by_default: bool


class TierDef(TypedDict):
    tier: int
    name: str
    description: str
    requires_approval: bool
    tools: list[ToolDef]


RECON_TIERS: list[TierDef] = [
    {
        "tier": 1,
        "name": "OSINT",
        "description": "Passive open-source intelligence. No direct contact with target.",
        "requires_approval": False,
        "tools": [
            {"name": "theHarvester",  "hexstrike_tool": "theharvester",   "description": "Email, subdomain, host discovery from public sources",   "enabled_by_default": True},
            {"name": "Shodan",        "hexstrike_tool": "shodan",          "description": "Internet-wide scanner data for the target",               "enabled_by_default": True},
            {"name": "Censys",        "hexstrike_tool": "censys",          "description": "Certificate and host exposure data",                      "enabled_by_default": True},
            {"name": "WHOIS",         "hexstrike_tool": "whois",           "description": "Domain registration and ownership data",                  "enabled_by_default": True},
            {"name": "Wayback",       "hexstrike_tool": "wayback",         "description": "Historical URLs from Wayback Machine",                    "enabled_by_default": True},
            {"name": "crt.sh",        "hexstrike_tool": "crtsh",           "description": "Certificate transparency log search",                    "enabled_by_default": True},
            {"name": "trufflehog",    "hexstrike_tool": "trufflehog",      "description": "Secret scanning in public repos",                         "enabled_by_default": True},
            {"name": "gitleaks",      "hexstrike_tool": "gitleaks",        "description": "Git history secret detection",                            "enabled_by_default": True},
        ],
    },
    {
        "tier": 2,
        "name": "Subdomain & Asset Discovery",
        "description": "Passive and semi-passive subdomain enumeration.",
        "requires_approval": False,
        "tools": [
            {"name": "Subfinder",     "hexstrike_tool": "subfinder",       "description": "Passive subdomain discovery",                             "enabled_by_default": True},
            {"name": "Amass",         "hexstrike_tool": "amass",           "description": "In-depth subdomain enumeration (passive mode)",           "enabled_by_default": True},
            {"name": "assetfinder",   "hexstrike_tool": "assetfinder",     "description": "Fast subdomain finding",                                  "enabled_by_default": True},
            {"name": "findomain",     "hexstrike_tool": "findomain",       "description": "Cross-platform subdomain finder",                         "enabled_by_default": True},
            {"name": "puredns",       "hexstrike_tool": "puredns",         "description": "DNS resolution and validation",                           "enabled_by_default": True},
        ],
    },
    {
        "tier": 3,
        "name": "DNS Analysis & Live Host Probing",
        "description": "DNS record enumeration and confirmed live host detection.",
        "requires_approval": False,
        "tools": [
            {"name": "dnsx",          "hexstrike_tool": "dnsx",            "description": "DNS toolkit — A, MX, TXT, CNAME records",                "enabled_by_default": True},
            {"name": "httpx",         "hexstrike_tool": "httpx",           "description": "HTTP/HTTPS probing for live hosts",                       "enabled_by_default": True},
            {"name": "httprobe",      "hexstrike_tool": "httprobe",        "description": "HTTP/HTTPS probe for discovered subdomains",               "enabled_by_default": True},
            {"name": "Naabu",         "hexstrike_tool": "naabu",           "description": "Port scanning on confirmed live hosts",                   "enabled_by_default": True},
            {"name": "SSL Labs",      "hexstrike_tool": "ssllabs",         "description": "SSL/TLS configuration analysis",                          "enabled_by_default": True},
        ],
    },
    {
        "tier": 4,
        "name": "Technology Fingerprinting & Content Discovery",
        "description": "Stack detection, content enumeration, and endpoint mapping.",
        "requires_approval": False,
        "tools": [
            {"name": "WhatWeb",       "hexstrike_tool": "whatweb",         "description": "Web technology fingerprinting",                            "enabled_by_default": True},
            {"name": "Wappalyzer",    "hexstrike_tool": "wappalyzer",      "description": "Technology stack detection",                              "enabled_by_default": True},
            {"name": "wafw00f",       "hexstrike_tool": "wafw00f",         "description": "WAF detection and fingerprinting",                        "enabled_by_default": True},
            {"name": "WPScan",        "hexstrike_tool": "wpscan",          "description": "WordPress vulnerability scanner",                         "enabled_by_default": False},
            {"name": "droopescan",    "hexstrike_tool": "droopescan",      "description": "CMS scanner (Drupal, SilverStripe, Moodle)",               "enabled_by_default": False},
            {"name": "Feroxbuster",   "hexstrike_tool": "feroxbuster",     "description": "Fast content and endpoint discovery",                     "enabled_by_default": True},
            {"name": "Gobuster",      "hexstrike_tool": "gobuster",        "description": "Directory and file brute-forcing",                        "enabled_by_default": True},
            {"name": "Katana",        "hexstrike_tool": "katana",          "description": "Web crawler with JavaScript parsing",                     "enabled_by_default": True},
            {"name": "gau",           "hexstrike_tool": "gau",             "description": "Fetch known URLs from AlienVault, Wayback, URLScan",      "enabled_by_default": True},
            {"name": "hakrawler",     "hexstrike_tool": "hakrawler",       "description": "Fast web crawler for endpoint discovery",                 "enabled_by_default": True},
        ],
    },
    {
        "tier": 5,
        "name": "Active Scanning",
        "description": "Direct active scanning — louder. Requires explicit operator approval before running.",
        "requires_approval": True,
        "tools": [
            {"name": "Nikto",         "hexstrike_tool": "nikto",           "description": "Web server vulnerability scanner",                        "enabled_by_default": True},
            {"name": "Aquatone",      "hexstrike_tool": "aquatone",        "description": "Visual website reconnaissance screenshots",               "enabled_by_default": True},
            {"name": "BuiltWith",     "hexstrike_tool": "builtwith",       "description": "Detailed technology profiler",                            "enabled_by_default": False},
        ],
    },
]

RECON_TIER_MAP = {t["tier"]: t for t in RECON_TIERS}
