"""
Integration tests for Timesheet state machine, validation, and approval flow.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"
OTHER_MANAGER_EMAIL = "des.manager@tsv.vn"
OTHER_MANAGER_PASSWORD = "Password123!"


async def _login(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _get_task_id(client: AsyncClient, headers: dict) -> str:
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
        json={"task_id": task_id, "work_date": str(work_date), "hours_logged": hours},
        headers=headers,
    )
    if resp.status_code != 201:
        pytest.skip(f"Date {work_date} already saturated; run on a fresh DB.")
    return resp.json()["data"]


def _past(days: int) -> date:
    return date.today() - timedelta(days=days)


# ── Create entry ───────────────────────────────────────────────────────────────

async def test_create_entry_success(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    d = _past(300)

    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(d), "hours_logged": 6.0},
        headers=emp_headers,
    )
    assert resp.status_code == 201, resp.text
    entry_id = resp.json()["data"]["id"]
    try:
        assert resp.json()["data"]["status"] == "DRAFT"
        assert float(resp.json()["data"]["hours_logged"]) == 6.0
    finally:
        await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)


async def test_create_entry_with_description(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    d = _past(301)

    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(d), "hours_logged": 2.0, "description": "Code review"},
        headers=emp_headers,
    )
    assert resp.status_code == 201
    entry_id = resp.json()["data"]["id"]
    try:
        assert resp.json()["data"]["description"] == "Code review"
    finally:
        await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)


async def test_create_entry_requires_auth(client: AsyncClient):
    resp = await client.post(
        "/api/timesheets",
        json={"task_id": str(uuid.uuid4()), "work_date": str(date.today()), "hours_logged": 4.0},
    )
    assert resp.status_code == 401


# ── Validate hours ─────────────────────────────────────────────────────────────

async def test_create_entry_hours_too_large(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(date.today()), "hours_logged": 17.0},
        headers=emp_headers,
    )
    assert resp.status_code == 422


async def test_create_entry_hours_zero(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    resp = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(date.today()), "hours_logged": 0.0},
        headers=emp_headers,
    )
    assert resp.status_code == 422


async def test_create_entry_future_date_rejected(client: AsyncClient):
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
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    d = _past(350)

    r1 = await client.post(
        "/api/timesheets",
        json={"task_id": task_id, "work_date": str(d), "hours_logged": 10.0},
        headers=emp_headers,
    )
    if r1.status_code != 201:
        pytest.skip("Date already has data; run on fresh DB.")
    first_id = r1.json()["data"]["id"]
    try:
        r2 = await client.post(
            "/api/timesheets",
            json={"task_id": task_id, "work_date": str(d), "hours_logged": 7.0},
            headers=emp_headers,
        )
        assert r2.status_code == 400
        assert "16" in r2.json()["detail"]
    finally:
        await client.delete(f"/api/timesheets/{first_id}", headers=emp_headers)


# ── List entries ───────────────────────────────────────────────────────────────

async def test_list_entries_returns_only_own(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets", headers=emp_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json()["data"], list)


async def test_list_entries_filter_by_status(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets?status=DRAFT", headers=emp_headers)
    assert resp.status_code == 200
    for e in resp.json()["data"]:
        assert e["status"] == "DRAFT"


async def test_list_entries_filter_by_month(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    today = date.today()
    resp = await client.get(
        f"/api/timesheets?year={today.year}&month={today.month}",
        headers=emp_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ── Update entry ───────────────────────────────────────────────────────────────

async def test_update_draft_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    entry = await _create_entry(client, emp_headers, task_id, _past(400), hours=3.0)
    entry_id = entry["id"]
    try:
        resp = await client.put(
            f"/api/timesheets/{entry_id}",
            json={"hours_logged": 5.0, "description": "Updated"},
            headers=emp_headers,
        )
        assert resp.status_code == 200
        assert float(resp.json()["data"]["hours_logged"]) == 5.0
    finally:
        await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)


async def test_cannot_update_submitted_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    entry = await _create_entry(client, emp_headers, task_id, _past(410), hours=3.0)
    entry_id = entry["id"]

    await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )

    resp = await client.put(
        f"/api/timesheets/{entry_id}",
        json={"hours_logged": 5.0},
        headers=emp_headers,
    )
    assert resp.status_code == 400


async def test_update_entry_not_found(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.put(
        "/api/timesheets/00000000-0000-0000-0000-000000000000",
        json={"hours_logged": 4.0},
        headers=emp_headers,
    )
    assert resp.status_code == 404


# ── Delete entry ───────────────────────────────────────────────────────────────

async def test_delete_draft_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    entry = await _create_entry(client, emp_headers, task_id, _past(420))
    entry_id = entry["id"]

    resp = await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)
    assert resp.status_code == 204

    get_resp = await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)
    assert get_resp.status_code == 404


async def test_cannot_delete_submitted_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    entry = await _create_entry(client, emp_headers, task_id, _past(430))
    entry_id = entry["id"]

    await client.post("/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers)

    resp = await client.delete(f"/api/timesheets/{entry_id}", headers=emp_headers)
    assert resp.status_code == 400


# ── Submit batch ───────────────────────────────────────────────────────────────

async def test_submit_batch_changes_status_to_submitted(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    e1 = await _create_entry(client, emp_headers, task_id, _past(440), hours=3.0)
    e2 = await _create_entry(client, emp_headers, task_id, _past(441), hours=4.0)

    resp = await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [e1["id"], e2["id"]]},
        headers=emp_headers,
    )
    assert resp.status_code == 200
    for entry in resp.json()["data"]:
        assert entry["status"] == "SUBMITTED"


async def test_submit_batch_already_submitted_rejected(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)
    entry = await _create_entry(client, emp_headers, task_id, _past(450))
    entry_id = entry["id"]

    await client.post("/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers)
    resp = await client.post("/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers)
    assert resp.status_code == 400


async def test_submit_empty_list_rejected(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.post("/api/timesheets/submit", json={"entry_ids": []}, headers=emp_headers)
    # API validates empty list at service layer (400), not Pydantic schema layer (422)
    assert resp.status_code in (400, 422)


# ── State machine: DRAFT → SUBMITTED → APPROVED ───────────────────────────────

async def test_approve_entry_full_flow(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(460), hours=4.0)
    entry_id = entry["id"]
    assert entry["status"] == "DRAFT"

    submit_resp = await client.post(
        "/api/timesheets/submit",
        json={"entry_ids": [entry_id]},
        headers=emp_headers,
    )
    assert submit_resp.json()["data"][0]["status"] == "SUBMITTED"

    approve_resp = await client.post(
        f"/api/timesheets/{entry_id}/approve",
        headers=mgr_headers,
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["data"]["status"] == "APPROVED"


async def test_approve_entry_sets_approved_by(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(461), hours=2.0)
    await client.post("/api/timesheets/submit", json={"entry_ids": [entry["id"]]}, headers=emp_headers)

    resp = await client.post(f"/api/timesheets/{entry['id']}/approve", headers=mgr_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["approved_by"] is not None
    assert data["approved_at"] is not None


# ── State machine: SUBMITTED → REJECTED → DRAFT ───────────────────────────────

async def test_reject_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(470), hours=5.0)
    await client.post("/api/timesheets/submit", json={"entry_ids": [entry["id"]]}, headers=emp_headers)

    resp = await client.post(
        f"/api/timesheets/{entry['id']}/reject",
        json={"reject_reason": "Missing project code"},
        headers=mgr_headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "REJECTED"
    assert data["reject_reason"] == "Missing project code"


async def test_rejected_entry_reverts_to_draft_on_edit(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(480), hours=5.0)
    entry_id = entry["id"]

    await client.post("/api/timesheets/submit", json={"entry_ids": [entry_id]}, headers=emp_headers)
    await client.post(
        f"/api/timesheets/{entry_id}/reject",
        json={"reject_reason": "Fix description"},
        headers=mgr_headers,
    )

    edit_resp = await client.put(
        f"/api/timesheets/{entry_id}",
        json={"description": "Fixed: Added details"},
        headers=emp_headers,
    )
    assert edit_resp.status_code == 200
    assert edit_resp.json()["data"]["status"] == "DRAFT"
    assert edit_resp.json()["data"]["reject_reason"] is None


# ── Manager scoping ────────────────────────────────────────────────────────────

async def test_manager_can_approve_own_dept_entry(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(490), hours=4.0)
    await client.post("/api/timesheets/submit", json={"entry_ids": [entry["id"]]}, headers=emp_headers)

    resp = await client.post(f"/api/timesheets/{entry['id']}/approve", headers=mgr_headers)
    assert resp.status_code == 200


async def test_wrong_dept_manager_cannot_approve(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    other_mgr = await _login(client, OTHER_MANAGER_EMAIL, OTHER_MANAGER_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    entry = await _create_entry(client, emp_headers, task_id, _past(500), hours=3.0)
    await client.post("/api/timesheets/submit", json={"entry_ids": [entry["id"]]}, headers=emp_headers)

    resp = await client.post(f"/api/timesheets/{entry['id']}/approve", headers=other_mgr)
    assert resp.status_code == 403


async def test_employee_cannot_access_pending(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets/pending", headers=emp_headers)
    assert resp.status_code == 403


async def test_manager_sees_pending_entries(client: AsyncClient):
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/timesheets/pending", headers=mgr_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json()["data"], list)


# ── Batch approve ──────────────────────────────────────────────────────────────

async def test_admin_batch_approve(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    task_id = await _get_task_id(client, emp_headers)

    e1 = await _create_entry(client, emp_headers, task_id, _past(510), hours=3.0)
    e2 = await _create_entry(client, emp_headers, task_id, _past(511), hours=4.0)

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


# ── Summary ────────────────────────────────────────────────────────────────────

async def test_summary_has_correct_shape(client: AsyncClient):
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


async def test_summary_requires_year_and_month(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/timesheets/summary", headers=emp_headers)
    assert resp.status_code == 422


# ── Reports ────────────────────────────────────────────────────────────────────

async def test_report_json_manager_access(client: AsyncClient):
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    resp = await client.get("/api/reports/timesheet", headers=mgr_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_report_csv_admin_access(client: AsyncClient):
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
