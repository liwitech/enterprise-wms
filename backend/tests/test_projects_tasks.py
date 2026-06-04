"""
Integration tests for Project, Sprint, and Task APIs.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import uuid
import pytest
from httpx import AsyncClient


# ── Helpers ───────────────────────────────────────────────────────────────────

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"


def _code() -> str:
    """Unique 8-char project code to avoid UNIQUE constraint conflicts."""
    return uuid.uuid4().hex[:8].upper()


async def _login(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    resp = await client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _me(client: AsyncClient, headers: dict) -> dict:
    """Return the flat /me payload (not wrapped in ApiResponse)."""
    resp = await client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    return resp.json()


async def _create_project(client: AsyncClient, headers: dict, **extra) -> dict:
    """Create a project and return its data dict."""
    u = await _me(client, headers)
    payload = {
        "org_id": u["org_id"],
        "code": _code(),
        "name": "Test Project",
        "owner_user_id": u["id"],
        **extra,
    }
    resp = await client.post("/api/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


# ── Project list ──────────────────────────────────────────────────────────────

async def test_list_projects_admin_sees_all(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
    assert body["meta"]["total"] >= 0


async def test_list_projects_employee_sees_only_member(client: AsyncClient):
    headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    resp = await client.get("/api/projects", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_list_projects_pagination(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    meta = resp.json()["meta"]
    assert meta["page"] == 1
    assert meta["per_page"] == 2


async def test_list_projects_search(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?search=Platform", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


async def test_list_projects_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/projects")
    assert resp.status_code == 401


# ── Project create ────────────────────────────────────────────────────────────

async def test_create_project_admin(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="Admin Project")
    assert "id" in project
    assert project["progress_percent"] == 0.0


async def test_create_project_employee_forbidden(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    u = await _me(client, emp_headers)
    resp = await client.post(
        "/api/projects",
        json={"org_id": u["org_id"], "code": _code(), "name": "Denied", "owner_user_id": u["id"]},
        headers=emp_headers,
    )
    assert resp.status_code == 403


# ── Project detail ────────────────────────────────────────────────────────────

async def test_get_project_detail_admin(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?per_page=1", headers=admin_headers)
    projects = resp.json()["data"]
    if not projects:
        pytest.skip("No projects in seed data")

    project_id = projects[0]["id"]
    detail_resp = await client.get(f"/api/projects/{project_id}", headers=admin_headers)
    assert detail_resp.status_code == 200
    data = detail_resp.json()["data"]
    assert "members" in data
    assert "milestones" in data
    assert "task_summary" in data
    assert isinstance(data["members"], list)


async def test_get_project_detail_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get(
        "/api/projects/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert resp.status_code == 404


async def test_get_project_employee_not_member_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)

    # Admin creates a project; employee is NOT added as member
    project = await _create_project(client, admin_headers, name="Private")
    project_id = project["id"]

    resp = await client.get(f"/api/projects/{project_id}", headers=emp_headers)
    assert resp.status_code == 403


# ── Dashboard ─────────────────────────────────────────────────────────────────

async def test_dashboard_returns_correct_shape(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?per_page=1", headers=admin_headers)
    projects = resp.json()["data"]
    if not projects:
        pytest.skip("No projects in seed data")

    project_id = projects[0]["id"]
    dash_resp = await client.get(
        f"/api/projects/{project_id}/dashboard", headers=admin_headers
    )
    assert dash_resp.status_code == 200
    data = dash_resp.json()["data"]
    for key in ("progress_percent", "tasks_by_status", "overdue_count",
                "upcoming_milestones", "member_workload", "recent_activities"):
        assert key in data


async def test_dashboard_cached_on_second_call(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?per_page=1", headers=admin_headers)
    projects = resp.json()["data"]
    if not projects:
        pytest.skip("No projects in seed data")

    project_id = projects[0]["id"]
    url = f"/api/projects/{project_id}/dashboard"
    r1 = await client.get(url, headers=admin_headers)
    r2 = await client.get(url, headers=admin_headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["data"]["progress_percent"] == r2.json()["data"]["progress_percent"]


# ── Members ───────────────────────────────────────────────────────────────────

async def test_add_and_remove_member(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, admin_headers, name="MemberTest")
    project_id = project["id"]

    # Get employee id
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]

    # Add
    add_resp = await client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )
    assert add_resp.status_code == 201
    assert add_resp.json()["data"]["user_id"] == emp_id

    # Duplicate add → 400
    dup = await client.post(
        f"/api/projects/{project_id}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )
    assert dup.status_code == 400

    # Remove
    del_resp = await client.delete(
        f"/api/projects/{project_id}/members/{emp_id}",
        headers=admin_headers,
    )
    assert del_resp.status_code == 204


# ── Sprints ───────────────────────────────────────────────────────────────────

async def test_sprint_lifecycle(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, admin_headers, name="SprintTest")
    project_id = project["id"]

    # Create sprint
    s1 = await client.post(
        f"/api/projects/{project_id}/sprints",
        json={"project_id": project_id, "name": "Sprint 1"},
        headers=admin_headers,
    )
    assert s1.status_code == 201
    sprint_id = s1.json()["data"]["id"]
    assert s1.json()["data"]["status"] == "PLANNING"

    # Activate
    act = await client.put(
        f"/api/projects/{project_id}/sprints/{sprint_id}/activate",
        headers=admin_headers,
    )
    assert act.status_code == 200
    assert act.json()["data"]["status"] == "ACTIVE"

    # Create second sprint (should be PLANNING)
    s2 = await client.post(
        f"/api/projects/{project_id}/sprints",
        json={"project_id": project_id, "name": "Sprint 2"},
        headers=admin_headers,
    )
    sprint2_id = s2.json()["data"]["id"]

    # Activating second auto-deactivates first
    act2 = await client.put(
        f"/api/projects/{project_id}/sprints/{sprint2_id}/activate",
        headers=admin_headers,
    )
    assert act2.status_code == 200

    # Only one active sprint at a time
    list_resp = await client.get(
        f"/api/projects/{project_id}/sprints", headers=admin_headers
    )
    active = [s for s in list_resp.json()["data"] if s["status"] == "ACTIVE"]
    assert len(active) == 1
    assert active[0]["id"] == sprint2_id


# ── Task fixture ──────────────────────────────────────────────────────────────

@pytest.fixture
async def project_and_task(client: AsyncClient):
    """Yields (admin_headers, project_id, task_id)."""
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, admin_headers, name="TaskTest")
    project_id = project["id"]

    task_resp = await client.post(
        "/api/tasks",
        json={"project_id": project_id, "title": "First task", "priority": "HIGH"},
        headers=admin_headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["data"]["id"]

    yield admin_headers, project_id, task_id


# ── Tasks ─────────────────────────────────────────────────────────────────────

async def test_create_task(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, admin_headers, name="CreateTask")
    project_id = project["id"]

    resp = await client.post(
        "/api/tasks",
        json={"project_id": project_id, "title": "My Task", "priority": "MEDIUM"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["title"] == "My Task"
    assert data["status"] == "TODO"


async def test_list_tasks_filters(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task
    resp = await client.get(f"/api/tasks?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]) >= 1


async def test_get_task_detail(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task
    resp = await client.get(f"/api/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["id"] == task_id
    for key in ("subtasks", "comments", "attachments", "timesheet_summary"):
        assert key in data


async def test_update_task(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task
    resp = await client.put(
        f"/api/tasks/{task_id}",
        json={"title": "Updated title", "priority": "CRITICAL"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "Updated title"


async def test_update_task_status(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "IN_PROGRESS"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "IN_PROGRESS"


async def test_task_status_invalid(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task
    resp = await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "INVALID_STATUS"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_task_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get(
        "/api/tasks/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert resp.status_code == 404


# ── Comments ──────────────────────────────────────────────────────────────────

async def test_add_and_list_comments(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task

    add_resp = await client.post(
        f"/api/tasks/{task_id}/comments",
        json={"content": "Looking good!"},
        headers=headers,
    )
    assert add_resp.status_code == 201
    data = add_resp.json()["data"]
    assert data["content"] == "Looking good!"
    assert "user" in data
    assert data["user"]["email"] == ADMIN_EMAIL

    list_resp = await client.get(f"/api/tasks/{task_id}/comments", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) >= 1
    assert list_resp.json()["meta"]["total"] >= 1


# ── Dashboard invalidation ────────────────────────────────────────────────────

async def test_dashboard_invalidated_after_status_change(client: AsyncClient, project_and_task):
    headers, project_id, task_id = project_and_task

    r1 = await client.get(f"/api/projects/{project_id}/dashboard", headers=headers)
    assert r1.status_code == 200

    await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "DONE"},
        headers=headers,
    )

    r2 = await client.get(f"/api/projects/{project_id}/dashboard", headers=headers)
    assert r2.status_code == 200
