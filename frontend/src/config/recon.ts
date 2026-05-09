export interface ToolDef {
  name: string
  hexstrike_tool: string
  description: string
  enabled_by_default: boolean
}

export interface TierDef {
  tier: number
  name: string
  description: string
  requires_approval: boolean
  tools: ToolDef[]
}

export const RECON_TIERS: TierDef[] = [
  {
    tier: 1, name: 'OSINT', requires_approval: false,
    description: 'Passive open-source intelligence. No direct contact with target.',
    tools: [
      { name: 'theHarvester', hexstrike_tool: 'theharvester', description: 'Email, subdomain, host discovery', enabled_by_default: true },
      { name: 'Shodan',       hexstrike_tool: 'shodan',        description: 'Internet-wide scanner data',      enabled_by_default: true },
      { name: 'Censys',       hexstrike_tool: 'censys',        description: 'Certificate and host exposure',   enabled_by_default: true },
      { name: 'WHOIS',        hexstrike_tool: 'whois',         description: 'Domain registration data',        enabled_by_default: true },
      { name: 'Wayback',      hexstrike_tool: 'wayback',       description: 'Historical URLs',                 enabled_by_default: true },
      { name: 'crt.sh',       hexstrike_tool: 'crtsh',         description: 'Certificate transparency logs',   enabled_by_default: true },
      { name: 'trufflehog',   hexstrike_tool: 'trufflehog',    description: 'Secret scanning in public repos', enabled_by_default: true },
      { name: 'gitleaks',     hexstrike_tool: 'gitleaks',      description: 'Git history secret detection',    enabled_by_default: true },
    ],
  },
  {
    tier: 2, name: 'Subdomain & Asset Discovery', requires_approval: false,
    description: 'Passive and semi-passive subdomain enumeration.',
    tools: [
      { name: 'Subfinder',   hexstrike_tool: 'subfinder',  description: 'Passive subdomain discovery',          enabled_by_default: true },
      { name: 'Amass',       hexstrike_tool: 'amass',       description: 'In-depth subdomain enumeration',       enabled_by_default: true },
      { name: 'assetfinder', hexstrike_tool: 'assetfinder', description: 'Fast subdomain finding',               enabled_by_default: true },
      { name: 'findomain',   hexstrike_tool: 'findomain',   description: 'Cross-platform subdomain finder',      enabled_by_default: true },
      { name: 'puredns',     hexstrike_tool: 'puredns',     description: 'DNS resolution and validation',        enabled_by_default: true },
    ],
  },
  {
    tier: 3, name: 'DNS Analysis & Live Host Probing', requires_approval: false,
    description: 'DNS record enumeration and confirmed live host detection.',
    tools: [
      { name: 'dnsx',     hexstrike_tool: 'dnsx',     description: 'DNS A, MX, TXT, CNAME records',    enabled_by_default: true },
      { name: 'httpx',    hexstrike_tool: 'httpx',    description: 'HTTP/HTTPS probing for live hosts', enabled_by_default: true },
      { name: 'httprobe', hexstrike_tool: 'httprobe', description: 'HTTP/HTTPS probe for subdomains',   enabled_by_default: true },
      { name: 'Naabu',    hexstrike_tool: 'naabu',    description: 'Port scanning on live hosts',       enabled_by_default: true },
      { name: 'SSL Labs', hexstrike_tool: 'ssllabs',  description: 'SSL/TLS configuration analysis',    enabled_by_default: true },
    ],
  },
  {
    tier: 4, name: 'Tech Fingerprinting & Content Discovery', requires_approval: false,
    description: 'Stack detection, content enumeration, and endpoint mapping.',
    tools: [
      { name: 'WhatWeb',     hexstrike_tool: 'whatweb',     description: 'Web technology fingerprinting',      enabled_by_default: true },
      { name: 'Wappalyzer',  hexstrike_tool: 'wappalyzer',  description: 'Technology stack detection',         enabled_by_default: true },
      { name: 'wafw00f',     hexstrike_tool: 'wafw00f',     description: 'WAF detection and fingerprinting',   enabled_by_default: true },
      { name: 'WPScan',      hexstrike_tool: 'wpscan',      description: 'WordPress vulnerability scanner',    enabled_by_default: false },
      { name: 'droopescan',  hexstrike_tool: 'droopescan',  description: 'CMS scanner (Drupal, SilverStripe)', enabled_by_default: false },
      { name: 'Feroxbuster', hexstrike_tool: 'feroxbuster', description: 'Fast content and endpoint discovery', enabled_by_default: true },
      { name: 'Gobuster',    hexstrike_tool: 'gobuster',    description: 'Directory and file brute-forcing',    enabled_by_default: true },
      { name: 'Katana',      hexstrike_tool: 'katana',      description: 'Web crawler with JS parsing',         enabled_by_default: true },
      { name: 'gau',         hexstrike_tool: 'gau',         description: 'Known URLs from multiple sources',    enabled_by_default: true },
      { name: 'hakrawler',   hexstrike_tool: 'hakrawler',   description: 'Fast web crawler',                    enabled_by_default: true },
    ],
  },
  {
    tier: 5, name: 'Active Scanning', requires_approval: true,
    description: 'Direct active scanning — louder. Requires explicit operator approval.',
    tools: [
      { name: 'Nikto',    hexstrike_tool: 'nikto',    description: 'Web server vulnerability scanner',    enabled_by_default: true },
      { name: 'Aquatone', hexstrike_tool: 'aquatone', description: 'Visual website reconnaissance',       enabled_by_default: true },
      { name: 'BuiltWith', hexstrike_tool: 'builtwith', description: 'Detailed technology profiler',      enabled_by_default: false },
    ],
  },
]
