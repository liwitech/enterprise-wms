"""
Integration test fixtures.

Prerequisites (run before pytest):
    docker compose exec backend alembic upgrade head
    docker compose exec backend python -m app.db.seed

Run tests:
    docker compose exec backend pip install pytest pytest-asyncio httpx
    docker compose exec backend pytest tests/ -v
"""
import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient, ASGITransport
from app.core.config import settings
from app.main import app


@pytest.fixture(autouse=True)
async def isolate_test():
    """
    Clear Redis rate-limit keys before each test, then dispose the SQLAlchemy
    asyncpg pool after the test. Each function-scoped async test runs in its
    own event loop; disposing the pool prevents loop-affinity errors when the
    next test's loop tries to reuse connections from the previous loop.
    """
    async with aioredis.from_url(settings.REDIS_URL, decode_responses=True) as r:
        keys = await r.keys("rate:login:*")
        if keys:
            await r.delete(*keys)

    yield

    from app.db.session import engine
    await engine.dispose()


# ── Seeded credentials ────────────────────────────────────────────────────────
ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
async def admin_tokens(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
async def admin_headers(admin_tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_tokens['access_token']}"}


@pytest.fixture
async def employee_tokens(client: AsyncClient) -> dict:
    resp = await client.post(
        "/api/auth/login",
        json={"email": EMPLOYEE_EMAIL, "password": EMPLOYEE_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture
async def employee_headers(employee_tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {employee_tokens['access_token']}"}
