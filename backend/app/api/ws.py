"""
WebSocket endpoints for real-time tool output streaming.

Architecture:
  Celery worker → publishes lines to Redis pub/sub channel
  WebSocket handler → subscribes to that channel → streams to browser

Channel name: nova:live:{engagement_id}
"""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import redis.asyncio as aioredis

from app.config import get_settings
from app.database import get_db
from app.models.engagement import Engagement
from app.core.security import decode_token

router = APIRouter()
settings = get_settings()

LIVE_CHANNEL = "nova:live:{engagement_id}"


@router.websocket("/ws/engagements/{engagement_id}/live")
async def live_feed(
    websocket: WebSocket,
    engagement_id: str,
    token: str = "",
):
    """
    Stream live tool output for an engagement.

    Authentication: pass access_token as query param ?token=<jwt>
    The token is validated before accepting the WebSocket connection.
    """
    # Validate token before accepting connection
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001)
        return

    await websocket.accept()

    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    channel = LIVE_CHANNEL.format(engagement_id=engagement_id)

    try:
        async with redis_client.pubsub() as pubsub:
            await pubsub.subscribe(channel)

            # Send connected acknowledgement
            await websocket.send_text(json.dumps({
                "type": "connected",
                "engagement_id": engagement_id,
            }))

            async def listen():
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        await websocket.send_text(message["data"])

            async def heartbeat():
                while True:
                    await asyncio.sleep(30)
                    await websocket.send_text(json.dumps({"type": "ping"}))

            # Run listener and heartbeat concurrently
            done, pending = await asyncio.wait(
                [asyncio.create_task(listen()), asyncio.create_task(heartbeat())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except WebSocketDisconnect:
        pass
    finally:
        await redis_client.aclose()
