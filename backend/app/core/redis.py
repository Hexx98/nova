import redis.asyncio as aioredis
from typing import AsyncGenerator

from app.config import get_settings

_client: aioredis.Redis | None = None


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    global _client
    if _client is None:
        _client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    yield _client
