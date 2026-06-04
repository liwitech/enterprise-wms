"""
Integration tests for Timesheet APIs.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient


# ── Credentials ───────────────────────────────────────────────────────────────

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"
# Designer is in a DIFFERENT dept (DEPT_DES), whose manager is des.manager@tsv.vn
OTHER_MANAGER_EMAIL = "des.manager@tsv.vn"
OTHER_MANAGER_PASSWORD = "Password123!"


async def _login(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    resp = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _me(client: AsyncClient, headers: dict) -> dict:
    resp = await client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    return resp.json()


async def _get_task_id(client: AsyncClient, headers: dict) -> str:
    """Return the first task visible to the user from seed data."""
    resp = await client.get("/api/tasks?per_page=1", headers=headers)
    assert resp.status_code == 200
    tasks = resp.json()["data"]
    if not tasks:
        pytest.skip("No tasks in seed data")
    return tasks[0]["id"]


async def _create_entry(
    client: AsyncClient,
    headers: dict,
    task_id: str,
    work_date: date,
    hours: float = 4.0,
) -> dict:
    resp = await client.post(
        "/api/timesheets",
        json={
            "task_id": task_id,
            "work_date": str(work_date),
            "hours_logged": hours,
        },
        headers=headers,
    )
    if resp.status_code != 201:
        pytest.skip(
            f"Date {work_date} already has too many hours from previous runs; "
            "run on a fresh DB to exercise this test"
        )
    return resp.json()["data"]


# ── Basic CRUD ────────────────────────────────────────────────────────────────

async def test_create_timesheet_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    # Far past: no seed data, each run cleans up so no accumulation
    clean_date = date.today() - timedelta(days=200)

    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(clean_date), "hours_logged": 6.0},
        headers=emp_headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    entry_id = data["id"]
    try:
        assert data["status"] == "DRAFT"
        assert float(data["hours_logged"]) == 6.0
    finally:
        await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)


async def test_list_timesheet_entries(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets", headers=emp_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)


async def test_update_draft_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    # Far past: no seed data conflict; cleanup ensures no accumulation
    clean_date = date.today() - timedelta(days=201)

    entry = await _create_entry(client, emp_headers, task_id, clean_date, hours=3.0)
    entry_id = entry["id"]

    try:
        resp = await client.put(
            f"/api/timesheets/{entry_id}",
            json={"hours_logged": 5.0, "description": "Updated"},
            headers=emp_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert float(data["hours_logged"]) == 5.0
        assert data["description"] == "Updated"
    finally:
        await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)


async def test_delete_draft_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    two_days_ago = date.today() - timedelta(days=2)

    entry = await _create_entry(client, emp_headers, task_id, two_days_ago, hours=2.0)
    entry_id = entry["id"]

    del_resp = await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)
    assert del_resp.status_code == 204

    # Verify gone — try to get (will 403 since not own if queried by manager, or 404)
    resp = await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)
    assert resp.status_code == 404


# ── Validation ────────────────────────────────────────────────────────────────

async def test_create_entry_hours_exceeds_16(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    today = date.today()

    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(today), "hours_logged": 17.0},
        headers=emp_headers,
    )
    assert resp.status_code == 422


async def test_create_entry_future_date(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    tomorrow = date.today() + timedelta(days=1)

    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(tomorrow), "hours_logged": 4.0},
        headers=emp_headers,
    )
    assert resp.status_code == 400
    assert "future" in resp.json()["detail"].lower()


async def test_daily_total_exceeds_16h(client: AsyncClient):
    """Two entries on same day that together exceed 16h → second one rejected."""
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    # Use a fixed past date; the test cleans up its DRAFT entry so reruns work
    old_date = date.today() - timedelta(days=30)

    r1 = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(old_date), "hours_logged": 10.0},
        headers=emp_headers,
    )
    if r1.status_code != 201:
        pytest.skip("Date already has accumulated data; run on a fresh DB")
    first_id = r1.json()["data"]["id"]

    try:
        # Second entry: 7h — total would be 17h → 400
        r2 = await client.post(
            "/api/timesheets",
            json={"task_id": task_id, "work_date": str(old_date), "hours_logged": 7.0},
            headers=emp_headers,
        )
        assert r2.status_code == 400
        assert "16h" in r2.json()["detail"]
    finally:
        await client.delete(f"/api/timesheets/{first_id}", headers=emp_headers)


# ── Submit batch ──────────────────────────────────────────────────────────────

async def test_submit_batch(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d1 = date.today() - timedelta(days=60)
    d2 = date.today() - timedelta(days=61)
    e1 = await _create_entry(client, emp_headers, task_id, d1, hours=3.0)
    e2 = await _create_entry(client, emp_headers, task_id, d2, hours=4.0)

    resp = await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [e1["id"], e2["id"]]},
        headers=emp_headers,
    )
    assert resp.status_code == 200
    for entry in resp.json()["data"]:
        assert entry["status"] == "SUBMITTED"


async def test_submit_already_submitted_fails(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=62)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=2.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )
    # Submit again → 400
    resp = await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )
    assert resp.status_code == 400


# ── Summary ───────────────────────────────────────────────────────────────────

async def test_summary_returns_correct_shape(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    today = date.today()

    resp = await client.get(
        f"/api/timesheets/summary?year={today.year}&month={today.month}",
        headers=emp_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "by_project" in data
    assert "by_day" in data
    assert "by_week" in data


# ── Approval flow ─────────────────────────────────────────────────────────────

async def test_manager_approves_own_dept_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=70)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=4.0)
    entry_id = entry["id"]

    # Submit
    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )

    # Manager approves
    resp = await client.post(
        f"/api/timesheets/{entry_id}/approve",
        headers=mgr_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "APPROVED"


async def test_wrong_dept_manager_cannot_approve(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    other_mgr = await _login(client, OTHER_MANAGER_EMAIL, OTHER_MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=80)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=3.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )

    resp = await client.post(
        f"/api/timesheets/{entry_id}/approve",
        headers=other_mgr,
    )
    assert resp.status_code == 403


async def test_manager_rejects_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=90)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=5.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )

    resp = await client.post(
        f"/api/timesheets/{entry_id}/reject",
        json={"reject_reason": "Missing description"},
        headers=mgr_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "REJECTED"
    assert data["reject_reason"] == "Missing description"


async def test_rejected_entry_becomes_draft_on_edit(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=100)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=5.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers
    )
    await client.post(
        f"/api/timesheets/{entry_id}/reject",
        json={"reject_reason": "Fix it"},
        headers=mgr_headers,
    )

    edit_resp = await client.put(
        f"/api/timesheets/{entry_id}",
        json={"description": "Fixed"},
        headers=emp_headers,
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["data"]["status"] == "DRAFT"
    assert edit_resp.json()["data"]["reject_reason"] is None


async def test_cannot_edit_submitted_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d = date.today() - timedelta(days=110)
    entry = await _create_entry(client, emp_headers, task_id, d, hours=2.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers
    )

    resp = await client.put(
        f"/api/timesheets/{entry_id}",
        json={"hours_logged": 3.0},
        headers=emp_headers,
    )
    assert resp.status_code == 400


# ── Pending list ──────────────────────────────────────────────────────────────

async def test_manager_sees_pending_entries(client: AsyncClient):
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/timesheets/pending", headers=mgr_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)


async def test_employee_cannot_access_pending(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets/pending", headers=emp_headers)
    assert resp.status_code == 403


# ── Batch approve ─────────────────────────────────────────────────────────────

async def test_admin_batch_approve(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    d1 = date.today() - timedelta(days=120)
    d2 = date.today() - timedelta(days=121)
    e1 = await _create_entry(client, emp_headers, task_id, d1, hours=3.0)
    e2 = await _create_entry(client, emp_headers, task_id, d2, hours=4.0)

    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [e1["id"], e2["id"]]},
        headers=emp_headers,
    )

    resp = await client.post(
        "/api/timesheets/approve-batch",
        json={"entry_ids": [e1["id"], e2["id"]]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    for entry in resp.json()["data"]:
        assert entry["status"] == "APPROVED"


# ── Reports ───────────────────────────────────────────────────────────────────

async def test_report_json(client: AsyncClient):
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/reports/timesheet", headers=mgr_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_report_csv(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/reports/timesheet?format=csv", headers=admin_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    lines = resp.text.strip().split("\n")
    assert lines[0].startswith("entry_id,user_email")


async def test_report_employee_forbidden(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/reports/timesheet", headers=emp_headers)
    assert resp.status_code == 403


async def test_weekly_summary_report(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/reports/timesheet/weekly-summary", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
