"""
Phase 1 — Reconnaissance Celery tasks.

Tier execution flow:
  Tiers 1-4 run sequentially (each tier starts after the previous completes).
  Within each tier, tools run in parallel via a Celery group.
  Tier 5 requires explicit operator approval — a separate gate task waits
  for the approval flag in Redis before dispatching Tier 5 tools.

Each tool task:
  1. Verifies HMAC payload signature (NovaTask base class)
  2. Re-validates the target against the current engagement scope
  3. Streams tool output from HexStrike, publishing each line to Redis
  4. Saves output to disk under the engagement folder
  5. Updates TaskRun status in the DB
"""
import asyncio
import hashlib
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

import redis as sync_redis
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.worker import celery_app, NovaTask
from app.models.task_run import TaskRun, TaskRunStatus
from app.models.engagement import Engagement
from app.services.hexstrike import HexStrikeClient
from app.config import get_settings
from sqlalchemy import select

settings = get_settings()

# Synchronous Redis client for use inside Celery worker tasks
_redis = sync_redis.from_url(settings.redis_url, decode_responses=True)


@asynccontextmanager
async def _task_db():
    """Per-task DB session using NullPool — avoids event loop conflicts with asyncio.run()."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await engine.dispose()

LIVE_CHANNEL = "nova:live:{engagement_id}"


def _publish(engagement_id: str, message: dict) -> None:
    """Publish a message to the engagement's live feed channel."""
    _redis.publish(LIVE_CHANNEL.format(engagement_id=engagement_id), json.dumps(message))


def _scope_hash(scope: dict) -> str:
    return hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest()


def _target_in_scope(target: str, scope: dict) -> bool:
    entries = scope.get("entries", [])
    for entry in entries:
        entry_target = entry.get("target", "").lower().strip()
        t = target.lower().strip()
        # Domain match: exact or subdomain
        if t == entry_target or t.endswith("." + entry_target):
            return True
    return False


@celery_app.task(base=NovaTask, name="nova.tasks.recon.run_tool", bind=True)
def run_recon_tool(self, *, engagement_id: str, phase_id: str, task_run_id: str,
                   tool_name: str, hexstrike_tool: str, tier: int,
                   target: str, scope_hash: str, **kwargs):
    """Execute a single recon tool via HexStrike and stream output to Redis."""
    asyncio.run(_run_tool_async(
        task_id=self.request.id,
        engagement_id=engagement_id,
        phase_id=phase_id,
        task_run_id=task_run_id,
        tool_name=tool_name,
        hexstrike_tool=hexstrike_tool,
        tier=tier,
        target=target,
        scope_hash=scope_hash,
    ))


async def _run_tool_async(*, task_id, engagement_id, phase_id, task_run_id,
                          tool_name, hexstrike_tool, tier, target, scope_hash):
    async with _task_db() as db:
        # Load records
        run_result = await db.execute(select(TaskRun).where(TaskRun.id == task_run_id))
        task_run = run_result.scalar_one_or_none()
        if not task_run:
            return

        eng_result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
        engagement = eng_result.scalar_one_or_none()
        if not engagement:
            return

        # Re-validate scope at execution time (STRIDE E4 mitigation)
        current_hash = _scope_hash(engagement.scope)
        if current_hash != scope_hash:
            task_run.status = TaskRunStatus.error
            task_run.error_message = "Scope was modified since task dispatch — task aborted for safety"
            await db.commit()
            _publish(engagement_id, {
                "type": "tool_status", "tool": tool_name, "tier": tier,
                "status": "error", "error": task_run.error_message,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            return

        if not _target_in_scope(target, engagement.scope):
            task_run.status = TaskRunStatus.error
            task_run.error_message = f"Target {target} is not in scope — rejected at worker"
            await db.commit()
            _publish(engagement_id, {
                "type": "tool_status", "tool": tool_name, "tier": tier,
                "status": "error", "error": task_run.error_message,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            return

        # Mark running
        task_run.status = TaskRunStatus.running
        task_run.started_at = datetime.now(timezone.utc)
        task_run.celery_task_id = str(task_id)
        await db.commit()

        _publish(engagement_id, {
            "type": "tool_status", "tool": tool_name, "tier": tier,
            "status": "running", "ts": datetime.now(timezone.utc).isoformat(),
        })

        # Prepare output file
        output_dir = os.path.join(
            engagement.folder_path or "/tmp",
            "phase_1_recon", "evidence",
        )
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{hexstrike_tool}_{target.replace('.', '_')}.txt")

        try:
            lines_written = 0
            async with HexStrikeClient() as client:
                with open(output_path, "w") as f:
                    async for line in client.stream_tool(hexstrike_tool, {"target": target}):
                        f.write(line + "\n")
                        lines_written += 1
                        _publish(engagement_id, {
                            "type": "tool_output",
                            "tool": tool_name,
                            "tier": tier,
                            "line": line,
                            "ts": datetime.now(timezone.utc).isoformat(),
                        })

            task_run.status = TaskRunStatus.complete
            task_run.completed_at = datetime.now(timezone.utc)
            task_run.output_path = output_path

        except Exception as e:
            task_run.status = TaskRunStatus.error
            task_run.error_message = str(e)[:500]

        await db.commit()

        _publish(engagement_id, {
            "type": "tool_status",
            "tool": tool_name,
            "tier": tier,
            "status": task_run.status.value,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
