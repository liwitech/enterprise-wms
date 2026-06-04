import json
import uuid
from datetime import timedelta
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

REFRESH_PREFIX = "refresh:"
RATE_LIMIT_PREFIX = "rate:login:"
DASHBOARD_PREFIX = "dashboard:"
TASK_STATUS_CHANNEL = "task:status_changed"

REFRESH_TTL = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
DASHBOARD_TTL = 300  # 5 minutes


def _client() -> aioredis.Redis:
    """Creates a fresh client per call — avoids event-loop affinity issues."""
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


# ── Refresh Token ─────────────────────────────────────────────────────────────

async def store_refresh_token(user_id: str) -> str:
    token = str(uuid.uuid4())
    async with _client() as r:
        await r.setex(f"{REFRESH_PREFIX}{token}", REFRESH_TTL, user_id)
    return token


async def verify_refresh_token(token: str) -> Optional[str]:
    async with _client() as r:
        return await r.get(f"{REFRESH_PREFIX}{token}")


async def revoke_refresh_token(token: str) -> None:
    async with _client() as r:
        await r.delete(f"{REFRESH_PREFIX}{token}")


# ── Rate Limiting ─────────────────────────────────────────────────────────────

async def check_rate_limit(ip: str, max_attempts: int = 5, window_seconds: int = 60) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    async with _client() as r:
        key = f"{RATE_LIMIT_PREFIX}{ip}"
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)  # TTL set only on first request
        results = await pipe.execute()
    return int(results[0]) <= max_attempts


# ── Dashboard Cache ───────────────────────────────────────────────────────────

async def dashboard_cache_get(project_id: str) -> Optional[str]:
    async with _client() as r:
        return await r.get(f"{DASHBOARD_PREFIX}{project_id}")


async def dashboard_cache_set(project_id: str, data: str) -> None:
    async with _client() as r:
        await r.setex(f"{DASHBOARD_PREFIX}{project_id}", DASHBOARD_TTL, data)


async def dashboard_cache_invalidate(project_id: str) -> None:
    async with _client() as r:
        await r.delete(f"{DASHBOARD_PREFIX}{project_id}")


# ── Task Events ───────────────────────────────────────────────────────────────

async def publish_task_status_changed(
    project_id: str,
    task_id: str,
    old_status: str,
    new_status: str,
    user_id: str,
) -> None:
    payload = json.dumps({
        "project_id": project_id,
        "task_id": task_id,
        "old_status": old_status,
        "new_status": new_status,
        "user_id": user_id,
    })
    async with _client() as r:
        await r.publish(TASK_STATUS_CHANNEL, payload)
