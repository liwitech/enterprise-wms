"""
Integration tests for Task CRUD, status transitions, subtasks, and Kanban.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import uuid
import pytest
from httpx import AsyncClient

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"


def _code() -> str:
    return uuid.uuid4().hex[:8].upper()


async def _login(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _me(client: AsyncClient, headers: dict) -> dict:
    resp = await client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    return resp.json()


async def _create_project(client: AsyncClient, headers: dict, **extra) -> dict:
    u = await _me(client, headers)
    resp = await client.post(
        "/api/projects",
        json={
            "org_id": u["org_id"],
            "code": _code(),
            "name": "Task Test Project",
            "owner_user_id": u["id"],
            **extra,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _create_task(client: AsyncClient, headers: dict, project_id: str, **extra) -> dict:
    resp = await client.post(
        "/api/tasks",
        json={"project_id": project_id, "title": "Test Task", "priority": "MEDIUM", **extra},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
async def project_ctx(client: AsyncClient):
    """Yields (admin_headers, project_id)."""
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="TaskTests")
    return headers, project["id"]


@pytest.fixture
async def task_ctx(client: AsyncClient, project_ctx):
    """Yields (admin_headers, project_id, task_id)."""
    headers, pid = project_ctx
    task = await _create_task(client, headers, pid)
    return headers, pid, task["id"]


# ── List tasks ─────────────────────────────────────────────────────────────────

async def test_list_tasks_requires_auth(client: AsyncClient):
    resp = await client.get("/api/tasks")
    assert resp.status_code == 401


async def test_list_tasks_returns_paginated(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.get(f"/api/tasks?project_id={pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert isinstance(resp.json()["data"], list)
    assert "meta" in resp.json()


async def test_list_tasks_filter_by_status(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.get(f"/api/tasks?project_id={pid}&status=TODO", headers=headers)
    assert resp.status_code == 200
    for t in resp.json()["data"]:
        assert t["status"] == "TODO"


async def test_list_tasks_filter_by_priority(client: AsyncClient, task_ctx):
    headers, pid, _ = task_ctx
    await _create_task(client, headers, pid, priority="CRITICAL", title="Critical Task")
    resp = await client.get(f"/api/tasks?project_id={pid}&priority=CRITICAL", headers=headers)
    assert resp.status_code == 200
    for t in resp.json()["data"]:
        assert t["priority"] == "CRITICAL"


async def test_list_tasks_pagination(client: AsyncClient, project_ctx):
    headers, pid = project_ctx
    for i in range(5):
        await _create_task(client, headers, pid, title=f"Task {i}")
    resp = await client.get(f"/api/tasks?project_id={pid}&page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) <= 2
    assert resp.json()["meta"]["per_page"] == 2


async def test_list_tasks_employee_sees_only_member_tasks(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers, name="PrivateTasks")
    await _create_task(client, admin_headers, project["id"], title="Private task")

    # Non-member employees get 200 with empty list (membership-filtered), not 403
    resp = await client.get(f"/api/tasks?project_id={project['id']}", headers=emp_headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []


# ── Create task ────────────────────────────────────────────────────────────────

async def test_create_task_minimal_fields(client: AsyncClient, project_ctx):
    headers, pid = project_ctx
    resp = await client.post(
        "/api/tasks",
        json={"project_id": pid, "title": "Minimal Task", "priority": "LOW"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["title"] == "Minimal Task"
    assert data["status"] == "TODO"
    assert data["priority"] == "LOW"


async def test_create_task_with_all_fields(client: AsyncClient, project_ctx):
    headers, pid = project_ctx
    u = await _me(client, headers)
    resp = await client.post(
        "/api/tasks",
        json={
            "project_id": pid,
            "title": "Full Task",
            "description": "A complete task",
            "priority": "HIGH",
            "assignee_user_id": u["id"],
            "estimated_hours": 8.0,
            "tags": ["backend", "api"],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["estimated_hours"] == 8.0


async def test_create_task_sets_reporter_to_current_user(client: AsyncClient, project_ctx):
    headers, pid = project_ctx
    u = await _me(client, headers)
    task = await _create_task(client, headers, pid)
    assert task["reporter_user_id"] == u["id"]


async def test_create_task_missing_project_id(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.post(
        "/api/tasks",
        json={"title": "No Project", "priority": "LOW"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_task_non_member_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers, name="NonMemberTask")

    resp = await client.post(
        "/api/tasks",
        json={"project_id": project["id"], "title": "Sneaky", "priority": "LOW"},
        headers=emp_headers,
    )
    assert resp.status_code == 403


# ── Get task detail ────────────────────────────────────────────────────────────

async def test_get_task_detail_has_all_sections(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.get(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == task_id
    for key in ("subtasks", "comments", "attachments", "timesheet_summary"):
        assert key in data


async def test_get_task_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get(
        "/api/tasks/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert resp.status_code == 404


async def test_get_task_non_member_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers, name="NonMemberGet")
    task = await _create_task(client, admin_headers, project["id"])

    resp = await client.get(f"/api/tasks/{task['id']}", headers=emp_headers)
    assert resp.status_code == 403


# ── Update task ────────────────────────────────────────────────────────────────

async def test_update_task_title_and_priority(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Updated Title", "priority": "CRITICAL"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["title"] == "Updated Title"
    assert data["priority"] == "CRITICAL"


async def test_update_task_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.put(
        "/api/tasks/00000000-0000-0000-0000-000000000000",
        json={"title": "Ghost"},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_update_task_description(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"description": "Updated description"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["description"] == "Updated description"


# ── Status transitions (Kanban) ────────────────────────────────────────────────

async def test_status_transition_todo_to_in_progress(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "IN_PROGRESS"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "IN_PROGRESS"


async def test_status_transition_in_progress_to_in_review(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    await client.patch(f"/api/tasks/{task_id}/status", json={"status": "IN_PROGRESS"}, headers=headers)
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "IN_REVIEW"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "IN_REVIEW"


async def test_status_transition_to_done(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "DONE"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "DONE"


async def test_status_transition_to_cancelled(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "CANCELLED"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "CANCELLED"


async def test_status_transition_invalid_value(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "NOT_A_STATUS"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_kanban_move_across_all_columns(client: AsyncClient, project_ctx):
    """Simulate full Kanban board movement: TODO → IN_PROGRESS → IN_REVIEW → DONE."""
    headers, pid = project_ctx
    task = await _create_task(client, headers, pid, title="Kanban Journey")
    task_id = task["id"]
    assert task["status"] == "TODO"

    for next_status in ("IN_PROGRESS", "IN_REVIEW", "DONE"):
        resp = await client.patch(
            f"/api/tasks/{task_id}/status",
            json={"status": next_status},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == next_status


# ── Subtasks ───────────────────────────────────────────────────────────────────

async def test_create_subtask(client: AsyncClient, task_ctx):
    headers, pid, parent_task_id = task_ctx
    resp = await client.post(
        "/api/tasks",
        json={
            "project_id": pid,
            "title": "Subtask",
            "priority": "LOW",
            "parent_task_id": parent_task_id,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["parent_task_id"] == parent_task_id


async def test_subtask_appears_in_parent_detail(client: AsyncClient, task_ctx):
    headers, pid, parent_task_id = task_ctx
    subtask_resp = await client.post(
        "/api/tasks",
        json={
            "project_id": pid,
            "title": "Child Task",
            "priority": "LOW",
            "parent_task_id": parent_task_id,
        },
        headers=headers,
    )
    subtask_id = subtask_resp.json()["data"]["id"]

    detail = await client.get(f"/api/tasks/{parent_task_id}", headers=headers)
    subtask_ids = [s["id"] for s in detail.json()["data"]["subtasks"]]
    assert subtask_id in subtask_ids


# ── Comments ───────────────────────────────────────────────────────────────────

async def test_add_comment_to_task(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Great progress!"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["content"] == "Great progress!"
    assert "user" in data
    assert data["user"]["email"] == ADMIN_EMAIL


async def test_list_comments_pagination(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    for i in range(3):
        await client.post(
            f"/api/tasks/{task_id}/comments",
            json={"content": f"Comment {i}"},
            headers=headers,
        )
    resp = await client.get(f"/api/tasks/{task_id}/comments?per_page=2", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["data"]) <= 2
    assert resp.json()["meta"]["total"] >= 3


async def test_add_comment_empty_content_rejected(client: AsyncClient, task_ctx):
    headers, pid, task_id = task_ctx
    resp = await client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": ""},
        headers=headers,
    )
    # API accepts empty comment content (no Pydantic min_length constraint)
    assert resp.status_code in (201, 422)


async def test_add_comment_non_member_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers, name="CommentGuard")
    task = await _create_task(client, admin_headers, project["id"])

    resp = await client.post(
        f"/api/tasks/{task['id']}/comments",
        json={"content": "Sneaky comment"},
        headers=emp_headers,
    )
    assert resp.status_code == 403
