export const CATEGORY_LABELS: Record<string, string> = {
  broken_access_control: 'Broken Access Control',
  cryptographic_failures: 'Cryptographic Failures',
  injection: 'Injection',
  insecure_design: 'Insecure Design',
  security_misconfiguration: 'Security Misconfiguration',
  vulnerable_components: 'Vulnerable Components',
  authentication: 'Authentication',
  integrity_failures: 'Integrity Failures',
  logging_failures: 'Logging & Monitoring',
  ssrf: 'SSRF',
  xss: 'XSS',
  other: 'Other',
}

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/30 border-red-700',
  high:     'text-orange-400 bg-orange-900/30 border-orange-700',
  medium:   'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  low:      'text-slate-400 bg-slate-800 border-slate-600',
}

export const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-slate-500',
}

export const TOOL_LABELS: Record<string, string> = {
  nuclei:      'Nuclei',
  sqlmap:      'SQLMap',
  hydra:       'Hydra',
  feroxbuster: 'Feroxbuster',
  wpscan:      'WPScan',
  burp:        'Burp Suite',
  jwt_tool:    'JWT Tool',
  testssl:     'testssl.sh',
  custom:      'Manual',
}

export const WORDLIST_OPTIONS = {
  directory: [
    { value: 'raft_medium_directories', label: 'Raft Medium Directories (30k)' },
    { value: 'raft_large_directories',  label: 'Raft Large Directories (62k)' },
    { value: 'dirbuster_medium',        label: 'DirBuster Medium (220k)' },
    { value: 'seclist_common',          label: 'SecList Common (4k) — Fast' },
  ],
  password: [
    { value: 'rockyou_top10k',   label: 'RockYou Top 10k' },
    { value: 'rockyou_top100k',  label: 'RockYou Top 100k' },
    { value: 'default_creds',    label: 'Default Credentials' },
    { value: 'darkweb2017_top',  label: 'DarkWeb2017 Top 1k' },
  ],
  username: [
    { value: 'top_usernames',       label: 'Top Usernames (1k)' },
    { value: 'xato_usernames_100k', label: 'Xato Usernames 100k' },
  ],
}
