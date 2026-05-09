"""
Global data masking layer.

Applied to ALL tool output before it is written to disk, sent over WebSocket,
or stored in any finding or report. Raw unmasked data is never stored.

Rules from PHASE_7_ACTIONS.md:
  Passwords    → first 2 chars + ***
  SSN          → ***-**-<last4>
  Credit card  → ****-****-****-<last4>
  API keys     → first 4 chars + ***
  Email        → first 2 chars + ***@domain
  Full names   → first name + last initial (heuristic, opt-in)
  DOB          → year only
  MRN          → ***<last3>
"""
import re
from typing import Callable

# Each rule: (compiled_pattern, replacement_callable_or_string)
_RULES: list[tuple[re.Pattern, str | Callable]] = [
    # Passwords in key=value / key:value format
    (
        re.compile(r'(?i)(password|passwd|pwd|pass|secret|token|api_key)\s*[=:]\s*(\S+)'),
        lambda m: m.group(1) + '=' + (m.group(2)[:2] + '***' if len(m.group(2)) > 2 else '***'),
    ),
    # SSN  XXX-XX-XXXX
    (
        re.compile(r'\b(\d{3})-(\d{2})-(\d{4})\b'),
        r'***-**-\3',
    ),
    # Credit card — 16 digits (optionally separated by spaces or dashes)
    (
        re.compile(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?(\d{4})\b'),
        r'****-****-****-\1',
    ),
    # Generic API / secret keys (sk_, pk_, rk_, ey, bearer tokens)
    (
        re.compile(r'\b(sk_|pk_|rk_|ey[A-Za-z0-9]{2}\.)[A-Za-z0-9_\-]{4}([A-Za-z0-9_\-]{4,})'),
        lambda m: m.group(1) + m.group(0)[len(m.group(1)):len(m.group(1))+4] + '***',
    ),
    # Email addresses
    (
        re.compile(r'\b([A-Za-z0-9]{2})[A-Za-z0-9._%+\-]*(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b'),
        r'\1***\2',
    ),
    # Date of birth  YYYY-MM-DD or MM/DD/YYYY — reduce to year only
    (
        re.compile(r'\b(19|20)\d{2}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b'),
        lambda m: m.group(0)[:4],
    ),
    # Medical record numbers  MRN: XXXXXXXX (8+ digits not already matched)
    (
        re.compile(r'\bMRN[:\s#]*\d+(\d{3})\b', re.IGNORECASE),
        r'MRN: ***\1',
    ),
]


def apply(text: str) -> str:
    """Apply all masking rules to a string. Returns the masked string."""
    for pattern, replacement in _RULES:
        if callable(replacement):
            text = pattern.sub(replacement, text)
        else:
            text = pattern.sub(replacement, text)
    return text


def apply_to_dict(data: dict) -> dict:
    """Recursively apply masking to all string values in a dict."""
    result = {}
    for k, v in data.items():
        if isinstance(v, str):
            result[k] = apply(v)
        elif isinstance(v, dict):
            result[k] = apply_to_dict(v)
        elif isinstance(v, list):
            result[k] = [apply(i) if isinstance(i, str) else i for i in v]
        else:
            result[k] = v
    return result
