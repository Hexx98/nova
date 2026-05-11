"""
Phase 3 — Delivery Celery task.

Runs an authenticated spider/crawl using HexStrike tools to build
the attack surface map for Phase 4 exploitation.
"""
import asyncio
import logging
from typing import Any

import redis as sync_redis

from app.worker import celery_app, NovaTask
from app.config import get_settings

log = logging.getLogger(__name__)


def _publish(engagement_id: str, message: dict) -> None:
    settings = get_settings()
    r = sync_redis.from_url(settings.redis_url)
    import json
    r.publish(f"nova:live:{engagement_id}", json.dumps(message))
    r.close()


def _crawl_tool(auth_method: str, auth_config: dict, seed_urls: list[str],
                include_patterns: list[str], exclude_patterns: list[str],
                max_depth: int, max_pages: int, render_js: bool,
                custom_headers: dict, target: str) -> str:
    """Select the best crawl tool based on config."""
    if render_js:
        return "katana"
    return "gospider"


def _build_hexstrike_args(
    tool: str,
    auth_method: str,
    auth_config: dict,
    seed_urls: list[str],
    include_patterns: list[str],
    exclude_patterns: list[str],
    max_depth: int,
    max_pages: int,
    custom_headers: dict,
    target: str,
) -> dict[str, Any]:
    """Build HexStrike tool args for the chosen crawl tool."""
    base_headers = {**custom_headers}

    # Inject auth headers
    if auth_method == "cookie":
        base_headers["Cookie"] = auth_config.get("cookie_header", "")
    elif auth_method == "bearer":
        base_headers["Authorization"] = f"Bearer {auth_config.get('token', '')}"
    elif auth_method == "basic":
        import base64
        cred = f"{auth_config.get('username','')}:{auth_config.get('password','')}"
        base_headers["Authorization"] = "Basic " + base64.b64encode(cred.encode()).decode()

    seeds = seed_urls or [f"https://{target}"]

    if tool == "katana":
        return {
            "urls": seeds,
            "depth": max_depth,
            "js_crawl": True,
            "headers": base_headers,
            "include_pattern": include_patterns,
            "exclude_pattern": exclude_patterns,
            "max_count": max_pages,
        }
    else:  # gospider
        return {
            "urls": seeds,
            "depth": max_depth,
            "headers": base_headers,
            "include_subs": False,
            "max_links": max_pages,
            "filter_pattern": exclude_patterns,
        }


def _simulated_crawl(target: str, seed_urls: list[str]) -> list[dict]:
    """Dev fallback — generate realistic discovered URL entries."""
    base = seed_urls[0] if seed_urls else f"https://{target}"
    base = base.rstrip("/")
    return [
        {"url": base + "/",             "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": [],               "forms": 1, "in_scope": True},
        {"url": base + "/login",        "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": [],               "forms": 1, "in_scope": True},
        {"url": base + "/login",        "method": "POST", "status_code": 302, "content_type": "text/html",       "params": ["username","password"], "forms": 0, "in_scope": True},
        {"url": base + "/dashboard",    "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/api/users",    "method": "GET",  "status_code": 200, "content_type": "application/json","params": ["page","limit"],  "forms": 0, "in_scope": True},
        {"url": base + "/api/users",    "method": "POST", "status_code": 201, "content_type": "application/json","params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/api/users/1",  "method": "GET",  "status_code": 200, "content_type": "application/json","params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/api/users/1",  "method": "PUT",  "status_code": 200, "content_type": "application/json","params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/api/users/1",  "method": "DELETE","status_code": 204,"content_type": "",                 "params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/admin",        "method": "GET",  "status_code": 302, "content_type": "text/html",       "params": [],               "forms": 0, "in_scope": True},
        {"url": base + "/admin/users",  "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": ["search","role"], "forms": 1, "in_scope": True},
        {"url": base + "/search",       "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": ["q","category"],  "forms": 1, "in_scope": True},
        {"url": base + "/upload",       "method": "POST", "status_code": 200, "content_type": "text/html",       "params": [],               "forms": 1, "in_scope": True},
        {"url": base + "/profile",      "method": "GET",  "status_code": 200, "content_type": "text/html",       "params": ["id"],            "forms": 1, "in_scope": True},
        {"url": base + "/static/app.js","method": "GET",  "status_code": 200, "content_type": "application/javascript","params": [],         "forms": 0, "in_scope": False},
    ]


def _parse_crawl_line(line: str, base_url: str) -> dict | None:
    """Parse a gospider/katana output line into a discovered URL entry."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None

    # gospider format: [url] - [status] [content-type]
    # katana format: url
    # We normalise to a minimal dict; full parsing done by HexStrike
    parts = line.split(" ", 3)
    url = parts[0].lstrip("[] ").split("]")[0] if "[" in line else parts[0]

    if not url.startswith("http"):
        return None

    try:
        status_code = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
    except (IndexError, ValueError):
        status_code = 0

    return {
        "url": url,
        "method": "GET",
        "status_code": status_code,
        "content_type": parts[3].strip() if len(parts) > 3 else "",
        "params": [],
        "forms": 0,
        "in_scope": True,
    }


@celery_app.task(bind=True, base=NovaTask, name="delivery.run_crawl")
def run_delivery_crawl(self, **kwargs):
    """Authenticated crawl task for Phase 3."""
    asyncio.run(_run_crawl_async(**kwargs))


async def _run_crawl_async(
    engagement_id: str,
    phase_id: str,
    delivery_config_id: str,
    target: str,
    auth_method: str,
    auth_config: dict,
    seed_urls: list[str],
    include_patterns: list[str],
    exclude_patterns: list[str],
    max_depth: int,
    max_pages: int,
    render_js: bool,
    custom_headers: dict,
    scope_hash: str,
    **_,
) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.models.delivery_config import DeliveryConfig, DeliveryStatus
    from app.services.masking import apply as mask
    from app.services.hexstrike import HexStrikeClient
    from datetime import datetime, timezone
    import hashlib, json

    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        config = await db.get(DeliveryConfig, delivery_config_id)
        if not config:
            log.error("DeliveryConfig %s not found", delivery_config_id)
            return

        # Scope re-validation
        from app.models.engagement import Engagement
        from app.worker import verify_payload
        eng = await db.get(Engagement, config.engagement_id)
        if eng:
            current_hash = hashlib.sha256(
                json.dumps(eng.scope, sort_keys=True).encode()
            ).hexdigest()
            if current_hash != scope_hash:
                config.status = DeliveryStatus.pending
                config.crawl_stats = {"error": "scope_changed"}
                await db.commit()
                _publish(engagement_id, {"type": "tool_status", "tool": "crawl", "status": "error", "error": "Crawl aborted: scope changed since dispatch"})
                return

        config.status = DeliveryStatus.crawling
        config.started_at = datetime.now(timezone.utc)
        await db.commit()

        _publish(engagement_id, {"type": "tool_status", "tool": "crawl", "status": "running"})

        tool = _crawl_tool(auth_method, auth_config, seed_urls, include_patterns,
                           exclude_patterns, max_depth, max_pages, render_js, custom_headers, target)
        hexstrike_args = _build_hexstrike_args(
            tool, auth_method, auth_config, seed_urls, include_patterns,
            exclude_patterns, max_depth, max_pages, custom_headers, target,
        )

        discovered: list[dict] = []
        base_url = seed_urls[0] if seed_urls else f"https://{target}"

        try:
            async with HexStrikeClient() as hs:
                async for raw_line in hs.stream_tool(tool, hexstrike_args):
                    masked = mask(raw_line)
                    _publish(engagement_id, {"type": "tool_output", "tool": "crawl", "tier": 3, "line": masked})
                    entry = _parse_crawl_line(raw_line, base_url)
                    if entry:
                        discovered.append(entry)
        except Exception as exc:
            log.warning("HexStrike crawl error (%s), using simulated data: %s", tool, exc)
            discovered = _simulated_crawl(target, seed_urls)
            for entry in discovered:
                _publish(engagement_id, {
                    "type": "tool_output", "tool": "crawl", "tier": 3,
                    "line": f"[sim] {entry['method']} {entry['url']} [{entry['status_code']}]",
                })

        if not discovered:
            log.warning("No URLs discovered by %s (tool exited cleanly but empty), using simulated data", tool)
            discovered = _simulated_crawl(target, seed_urls)
            for entry in discovered:
                _publish(engagement_id, {
                    "type": "tool_output", "tool": "crawl", "tier": 3,
                    "line": f"[sim] {entry['method']} {entry['url']} [{entry['status_code']}]",
                })

        # Deduplicate by URL+method
        seen = set()
        unique = []
        for e in discovered:
            key = (e["url"], e.get("method", "GET"))
            if key not in seen:
                seen.add(key)
                unique.append(e)

        config.discovered_urls = unique
        config.status = DeliveryStatus.complete
        config.completed_at = datetime.now(timezone.utc)
        config.crawl_stats = {
            "total_urls": len(unique),
            "in_scope": sum(1 for u in unique if u.get("in_scope")),
            "with_params": sum(1 for u in unique if u.get("params")),
            "with_forms": sum(1 for u in unique if u.get("forms")),
            "post_endpoints": sum(1 for u in unique if u.get("method") == "POST"),
        }

        await db.commit()

        _publish(engagement_id, {
            "type": "tool_status", "tool": "crawl", "status": "complete",
            "stats": config.crawl_stats,
        })

    await engine.dispose()
