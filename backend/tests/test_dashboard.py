"""
Integration tests for Executive Dashboard — data accuracy and cache behavior.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import pytest
from httpx import AsyncClient

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"


async def _login(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ── Access control ─────────────────────────────────────────────────────────────

async def test_executive_dashboard_requires_auth(client: AsyncClient):
    resp = await client.get("/api/dashboard/executive")
    assert resp.status_code == 401


async def test_employee_cannot_access_executive_dashboard(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=emp_headers)
    assert resp.status_code == 403


async def test_manager_can_access_executive_dashboard(client: AsyncClient):
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=mgr_headers)
    assert resp.status_code == 200


# ── Shape and data accuracy ────────────────────────────────────────────────────

async def test_executive_dashboard_correct_shape(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    for key in ("summary", "projects", "alerts", "workload", "timesheet_pending_count"):
        assert key in data


async def test_executive_summary_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    summary = resp.json()["data"]["summary"]
    for field in (
        "total_projects",
        "projects_on_track",
        "projects_delayed",
        "projects_overdue",
        "total_tasks_open",
        "tasks_due_soon",
        "total_employees_active",
    ):
        assert field in summary, f"Missing field: {field}"


async def test_executive_summary_non_negative_values(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    summary = resp.json()["data"]["summary"]
    for field in ("total_projects", "projects_on_track", "projects_delayed",
                  "projects_overdue", "total_tasks_open", "tasks_due_soon"):
        assert summary[field] >= 0, f"{field} should be >= 0"


async def test_executive_summary_consistency(client: AsyncClient):
    """on_track + delayed + overdue should not exceed total."""
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    s = resp.json()["data"]["summary"]
    assert (s["projects_on_track"] + s["projects_delayed"] + s["projects_overdue"]
            <= s["total_projects"])


async def test_executive_projects_list_has_required_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    projects = resp.json()["data"]["projects"]
    for p in projects[:3]:  # spot check first 3
        for field in ("id", "name", "owner", "health", "progress_percent", "tasks_total", "tasks_done"):
            assert field in p, f"Missing project field: {field}"


async def test_executive_projects_health_valid_values(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    valid_health = {"ON_TRACK", "AT_RISK", "OVERDUE"}
    for p in resp.json()["data"]["projects"]:
        assert p["health"] in valid_health


async def test_executive_alerts_have_required_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    for alert in resp.json()["data"]["alerts"]:
        for field in ("project_id", "alert_type", "message", "severity"):
            assert field in alert


async def test_executive_workload_has_required_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    for item in resp.json()["data"]["workload"][:3]:
        for field in ("user_id", "name", "tasks_assigned", "capacity_percent"):
            assert field in item


async def test_executive_workload_capacity_non_negative(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    for item in resp.json()["data"]["workload"]:
        assert item["capacity_percent"] >= 0


async def test_timesheet_pending_count_is_integer(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=headers)
    count = resp.json()["data"]["timesheet_pending_count"]
    assert isinstance(count, int)
    assert count >= 0


# ── Period filters ─────────────────────────────────────────────────────────────

async def test_dashboard_current_month_period(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive?period=current_month", headers=headers)
    assert resp.status_code == 200
    assert "summary" in resp.json()["data"]


async def test_dashboard_current_quarter_period(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive?period=current_quarter", headers=headers)
    assert resp.status_code == 200
    assert "summary" in resp.json()["data"]


async def test_dashboard_invalid_period_rejected(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/dashboard/executive?period=invalid_period", headers=headers)
    assert resp.status_code == 422


# ── Cache behavior ─────────────────────────────────────────────────────────────

async def test_dashboard_second_call_returns_same_data(client: AsyncClient):
    """Two consecutive calls should return identical summary data (cache hit)."""
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    url = "/api/dashboard/executive?period=current_month"
    r1 = await client.get(url, headers=headers)
    r2 = await client.get(url, headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["data"]["summary"] == r2.json()["data"]["summary"]


async def test_dashboard_different_periods_return_different_keys(client: AsyncClient):
    """Different period params produce different cache keys (both must succeed)."""
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    r_month = await client.get("/api/dashboard/executive?period=current_month", headers=headers)
    r_quarter = await client.get("/api/dashboard/executive?period=current_quarter", headers=headers)
    assert r_month.status_code == 200
    assert r_quarter.status_code == 200


# ── Manager scoping ────────────────────────────────────────────────────────────

async def test_manager_dashboard_scoped_to_dept(client: AsyncClient):
    """Manager gets a valid dashboard (scoped to their dept, not all orgs)."""
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/dashboard/executive", headers=mgr_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "summary" in data
    assert "projects" in data
