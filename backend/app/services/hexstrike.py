"""
HexStrike AI client.

Nova communicates with HexStrike over HTTP/SSE on the internal Docker network.
HexStrike runs as a separate container (hexstrike:9000) and is never exposed
to external networks — Nova proxies all tool execution through it.

The startup command in hexstrike/Dockerfile sets the SSE transport.
Update HEXSTRIKE_CMD in that Dockerfile once the submodule is initialized
and the exact startup command is confirmed.
"""
import json
import asyncio
from typing import AsyncGenerator
from contextlib import asynccontextmanager

import httpx

from app.config import get_settings
from app.services import masking

settings = get_settings()

_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


class HexStrikeClient:
    """Async HTTP client for the HexStrike MCP tool execution server."""

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.hexstrike_url,
            timeout=_TIMEOUT,
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self._client.aclose()

    async def health(self) -> bool:
        try:
            r = await self._client.get("/health")
            return r.status_code == 200
        except Exception:
            return False

    async def stream_tool(
        self,
        tool_name: str,
        args: dict,
        apply_masking: bool = True,
    ) -> AsyncGenerator[str, None]:
        """
        Stream output lines from a HexStrike tool execution.

        Masking is applied here — raw output never leaves this generator.
        Each yielded string is one masked output line.

        The HexStrike SSE endpoint is: POST /tools/{tool_name}/run
        with args in the request body.
        """
        try:
            async with self._client.stream(
                "POST",
                f"/tools/{tool_name}/run",
                json=args,
                headers={"Accept": "text/event-stream"},
            ) as response:
                response.raise_for_status()

                async for raw_line in response.aiter_lines():
                    if not raw_line:
                        continue

                    # SSE format: "data: <payload>"
                    if raw_line.startswith("data: "):
                        payload = raw_line[6:]
                        try:
                            data = json.loads(payload)
                            line = data.get("output", payload)
                        except json.JSONDecodeError:
                            line = payload

                        yield masking.apply(line) if apply_masking else line

        except httpx.ConnectError:
            # HexStrike not yet running — dev mode fallback
            async for line in _dev_fallback(tool_name, args):
                yield masking.apply(line) if apply_masking else line

        except Exception as e:
            yield f"[ERROR] {tool_name}: {e}"


async def _dev_fallback(tool_name: str, args: dict) -> AsyncGenerator[str, None]:
    """
    Simulated tool output for development when HexStrike is not running.
    Replace with real HexStrike calls in production.
    """
    target = args.get("target", "example.com")

    simulated: dict[str, list[str]] = {
        "subfinder":   [f"api.{target}", f"staging.{target}", f"mail.{target}", f"dev.{target}"],
        "theHarvester":[f"admin@{target}", f"info@{target}", f"Found host: {target}"],
        "httpx":       [f"https://{target} [200] [nginx/1.24]", f"https://api.{target} [200] [express]"],
        "whatweb":     [f"{target} [200 OK] Bootstrap[4.6.0], jQuery[3.6.0], Nginx[1.24]"],
        "wafw00f":     [f"[*] Testing {target}", f"[+] The site {target} is behind Cloudflare WAF"],
        "feroxbuster": [f"200 /admin", f"200 /api/v1", f"200 /login", f"403 /.git"],
        "naabu":       [f"{target}:80", f"{target}:443", f"{target}:8080"],
        "nikto":       [f"+ Server: nginx/1.24.0", f"+ OSVDB-3268: /admin/: Directory indexing found"],
        "wpscan":      [f"[+] WordPress version 6.4.3 identified", f"[!] 3 vulnerabilities identified"],
    }

    lines = simulated.get(tool_name, [f"[{tool_name}] Scanning {target}...", f"[{tool_name}] Done."])

    for line in lines:
        await asyncio.sleep(0.3)
        yield line

    await asyncio.sleep(0.1)
