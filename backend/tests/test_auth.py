"""
Auth integration tests.
Require seeded DB + Redis (run inside docker compose exec backend pytest).
"""
import pytest
from datetime import datetime
from jose import jwt
from httpx import AsyncClient

from app.core.config import settings
from app.core.redis_client import revoke_refresh_token

# ── helpers ───────────────────────────────────────────────────────────────────

def _make_expired_token(user_id: str) -> str:
    import uuid
    payload = {
        "sub": user_id,
        "exp": datetime(2020, 1, 1),
        "type": "access",
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── Login ─────────────────────────────────────────────────────────────────────

async def test_login_success(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "admin@tsv.vn", "password": "Password123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "admin@tsv.vn", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401
    assert "Incorrect" in resp.json()["detail"]


async def test_login_unknown_email(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "Password123!"},
    )
    assert resp.status_code == 401


async def test_login_invalid_email_format(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "not-an-email", "password": "Password123!"},
    )
    assert resp.status_code == 422  # Pydantic validation


# ── Token expiry ──────────────────────────────────────────────────────────────

async def test_expired_access_token_rejected(client: AsyncClient):
    expired = _make_expired_token("00000000-0000-0000-0000-000000000099")
    resp = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {expired}"},
    )
    assert resp.status_code == 401


async def test_garbage_token_rejected(client: AsyncClient):
    resp = await client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert resp.status_code == 401


async def test_missing_token_rejected(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


# ── Refresh ───────────────────────────────────────────────────────────────────

async def test_refresh_returns_new_access_token(
    client: AsyncClient, admin_tokens: dict
):
    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": admin_tokens["refresh_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    # New token must be different from the original
    assert data["access_token"] != admin_tokens["access_token"]


async def test_invalid_refresh_token_rejected(client: AsyncClient):
    resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": "00000000-dead-beef-cafe-000000000000"},
    )
    assert resp.status_code == 401


# ── Logout ────────────────────────────────────────────────────────────────────

async def test_logout_revokes_refresh_token(
    client: AsyncClient, admin_tokens: dict, admin_headers: dict
):
    # Logout
    logout_resp = await client.post(
        "/api/auth/logout",
        json={"refresh_token": admin_tokens["refresh_token"]},
        headers=admin_headers,
    )
    assert logout_resp.status_code == 204

    # Refresh should now fail
    refresh_resp = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": admin_tokens["refresh_token"]},
    )
    assert refresh_resp.status_code == 401


# ── /me endpoint ──────────────────────────────────────────────────────────────

async def test_me_returns_user_data(
    client: AsyncClient, admin_headers: dict
):
    resp = await client.get("/api/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@tsv.vn"
    assert data["role"] == "SUPER_ADMIN"
    assert "permissions" in data
    assert isinstance(data["permissions"], list)
    assert "project_roles" in data


# ── RBAC — permissions per role ───────────────────────────────────────────────

async def test_super_admin_has_full_permissions(
    client: AsyncClient, admin_headers: dict
):
    resp = await client.get("/api/auth/me", headers=admin_headers)
    perms = resp.json()["permissions"]
    assert "org:manage" in perms
    assert "user:manage" in perms
    assert "timesheet:approve" in perms


async def test_employee_has_limited_permissions(
    client: AsyncClient, employee_headers: dict
):
    resp = await client.get("/api/auth/me", headers=employee_headers)
    data = resp.json()
    perms = data["permissions"]

    assert data["role"] == "EMPLOYEE"
    assert "org:manage" not in perms
    assert "user:manage" not in perms
    assert "timesheet:create" in perms
    assert "task:create" in perms


async def test_employee_has_project_roles(
    client: AsyncClient, employee_headers: dict
):
    resp = await client.get("/api/auth/me", headers=employee_headers)
    data = resp.json()
    # dev1@tsv.vn is a member of several projects from seed data
    assert len(data["project_roles"]) > 0
    for pr in data["project_roles"]:
        assert "project_id" in pr
        assert "role" in pr


async def test_manager_can_approve_timesheets(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={"email": "eng.manager@tsv.vn", "password": "Password123!"},
    )
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    me = await client.get("/api/auth/me", headers=headers)
    assert "timesheet:approve" in me.json()["permissions"]


# ── Health check (smoke test, no auth) ───────────────────────────────────────

async def test_health_check_public(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
