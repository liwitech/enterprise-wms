from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text
from redis.asyncio import from_url as redis_from_url

from app.core.config import settings
from app.db.session import AsyncSessionLocal

router = APIRouter()


@router.get("/health", tags=["health"])
async def health_check():
    db_status = "healthy"
    redis_status = "healthy"

    # Check database
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    # Check Redis
    try:
        r = redis_from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
    except Exception as exc:
        redis_status = f"unhealthy: {exc}"

    overall = "healthy" if db_status == "healthy" and redis_status == "healthy" else "degraded"

    return {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "ewms-backend",
        "version": settings.VERSION,
        "checks": {
            "database": db_status,
            "redis": redis_status,
        },
    }
