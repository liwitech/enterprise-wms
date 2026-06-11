"""
Integration tests for Project CRUD, permissions, filters, and dashboard.
Requires seeded DB (alembic upgrade head + python -m app.db.seed).
"""
import uuid
import pytest
from httpx import AsyncClient

ADMIN_EMAIL = "admin@tsv.vn"
ADMIN_PASSWORD = "Password123!"
MANAGER_EMAIL = "eng.manager@tsv.vn"
MANAGER_PASSWORD = "Password123!"
EMPLOYEE_EMAIL = "dev1@tsv.vn"
EMPLOYEE_PASSWORD = "Password123!"


def _code() -> str:
    return uuid.uuid4().hex[:8].upper()


async def _login(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _me(client: AsyncClient, headers: dict) -> dict:
    resp = await client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    return resp.json()


async def _create_project(client: AsyncClient, headers: dict, **extra) -> dict:
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


# ── List / filter / pagination ─────────────────────────────────────────────────

async def test_list_projects_requires_auth(client: AsyncClient):
    resp = await client.get("/api/projects")
    assert resp.status_code == 401


async def test_list_projects_admin_sees_all(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
    assert "meta" in body


async def test_list_projects_pagination_shape(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?page=1&per_page=3", headers=headers)
    assert resp.status_code == 200
    meta = resp.json()["meta"]
    assert meta["page"] == 1
    assert meta["per_page"] == 3
    assert len(resp.json()["data"]) <= 3


async def test_list_projects_second_page(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    r1 = await client.get("/api/projects?page=1&per_page=2", headers=headers)
    r2 = await client.get("/api/projects?page=2&per_page=2", headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    ids1 = {p["id"] for p in r1.json()["data"]}
    ids2 = {p["id"] for p in r2.json()["data"]}
    assert ids1.isdisjoint(ids2) or not ids2  # pages must not overlap


async def test_list_projects_filter_status(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?status=IN_PROGRESS", headers=headers)
    assert resp.status_code == 200
    for p in resp.json()["data"]:
        assert p["status"] == "IN_PROGRESS"


async def test_list_projects_filter_priority(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get("/api/projects?priority=HIGH", headers=headers)
    assert resp.status_code == 200
    for p in resp.json()["data"]:
        assert p["priority"] == "HIGH"


async def test_list_projects_search(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    unique_name = f"Search_{_code()}"
    await _create_project(client, admin_headers, name=unique_name)

    resp = await client.get(f"/api/projects?search={unique_name[:8]}", headers=admin_headers)
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()["data"]]
    assert any(unique_name[:8] in n for n in names)


async def test_list_projects_employee_sees_only_member_projects(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]

    # Create a private project (no employee)
    private = await _create_project(client, admin_headers, name="PrivateFromEmployee")

    emp_resp = await client.get("/api/projects", headers=emp_headers)
    assert emp_resp.status_code == 200
    emp_ids = {p["id"] for p in emp_resp.json()["data"]}
    assert private["id"] not in emp_ids


# ── Create project ─────────────────────────────────────────────────────────────

async def test_create_project_admin_success(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="Admin Creates")
    assert project["progress_percent"] == 0.0
    assert project["status"] == "PLANNING"


async def test_create_project_manager_success(client: AsyncClient):
    headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    project = await _create_project(client, headers, name="Manager Creates")
    assert "id" in project


async def test_create_project_employee_forbidden(client: AsyncClient):
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    u = await _me(client, emp_headers)
    resp = await client.post(
        "/api/projects",
        json={"org_id": u["org_id"], "code": _code(), "name": "Denied", "owner_user_id": u["id"]},
        headers=emp_headers,
    )
    assert resp.status_code == 403


async def test_create_project_missing_required_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.post("/api/projects", json={"name": "No Code"}, headers=headers)
    assert resp.status_code == 422


async def test_create_project_with_all_fields(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    u = await _me(client, headers)
    resp = await client.post(
        "/api/projects",
        json={
            "org_id": u["org_id"],
            "code": _code(),
            "name": "Full Project",
            "owner_user_id": u["id"],
            "description": "A full project",
            "status": "PLANNING",
            "priority": "HIGH",
            "project_type": "AGILE",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["priority"] == "HIGH"
    assert data["project_type"] == "AGILE"


async def test_create_project_auto_adds_creator_as_pm(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    u = await _me(client, headers)
    project = await _create_project(client, headers, name="AutoPM")

    detail_resp = await client.get(f"/api/projects/{project['id']}", headers=headers)
    members = detail_resp.json()["data"]["members"]
    pm_ids = [m["user_id"] for m in members if m["role"] == "PM"]
    assert u["id"] in pm_ids


# ── Get project detail ─────────────────────────────────────────────────────────

async def test_get_project_detail_contains_all_sections(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="DetailTest")
    resp = await client.get(f"/api/projects/{project['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "members" in data
    assert "milestones" in data
    assert "task_summary" in data
    assert isinstance(data["members"], list)
    assert isinstance(data["milestones"], list)


async def test_get_project_detail_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.get(
        "/api/projects/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert resp.status_code == 404


async def test_get_project_employee_not_member_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers, name="PrivateProject")
    resp = await client.get(f"/api/projects/{project['id']}", headers=emp_headers)
    assert resp.status_code == 403


async def test_get_project_employee_member_allowed(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]
    project = await _create_project(client, admin_headers, name="SharedProject")

    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )

    resp = await client.get(f"/api/projects/{project['id']}", headers=emp_headers)
    assert resp.status_code == 200


# ── Update project ─────────────────────────────────────────────────────────────

async def test_update_project_name_and_status(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="UpdateMe")
    resp = await client.put(
        f"/api/projects/{project['id']}",
        json={"name": "Updated Name", "status": "IN_PROGRESS"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["name"] == "Updated Name"
    assert data["status"] == "IN_PROGRESS"


async def test_update_project_not_found(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    resp = await client.put(
        "/api/projects/00000000-0000-0000-0000-000000000000",
        json={"name": "Ghost"},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_update_project_employee_non_pm_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]
    project = await _create_project(client, admin_headers)

    await client.post(
        f"/api/projects/{project['id']}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )

    resp = await client.put(
        f"/api/projects/{project['id']}",
        json={"name": "Hacked"},
        headers=emp_headers,
    )
    assert resp.status_code == 403


# ── Delete project ─────────────────────────────────────────────────────────────

async def test_delete_project_admin_success(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="ToDelete")
    resp = await client.delete(f"/api/projects/{project['id']}", headers=headers)
    assert resp.status_code == 204


async def test_delete_project_employee_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers)
    resp = await client.delete(f"/api/projects/{project['id']}", headers=emp_headers)
    assert resp.status_code == 403


async def test_delete_project_manager_forbidden(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    mgr_headers = await _login(client, MANAGER_EMAIL, MANAGER_PASSWORD)
    project = await _create_project(client, admin_headers)
    resp = await client.delete(f"/api/projects/{project['id']}", headers=mgr_headers)
    assert resp.status_code == 403


# ── Project dashboard ──────────────────────────────────────────────────────────

async def test_project_dashboard_shape(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="DashTest")
    resp = await client.get(f"/api/projects/{project['id']}/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    for key in ("progress_percent", "tasks_by_status", "overdue_count",
                "upcoming_milestones", "member_workload", "recent_activities"):
        assert key in data


async def test_project_dashboard_requires_access(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    project = await _create_project(client, admin_headers)
    resp = await client.get(f"/api/projects/{project['id']}/dashboard", headers=emp_headers)
    assert resp.status_code == 403


async def test_project_dashboard_cache_consistent(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="CacheConsistency")
    url = f"/api/projects/{project['id']}/dashboard"
    r1 = await client.get(url, headers=headers)
    r2 = await client.get(url, headers=headers)
    assert r1.status_code == 200
    assert r2.json()["data"]["progress_percent"] == r1.json()["data"]["progress_percent"]


async def test_project_dashboard_invalidated_on_task_status_change(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="CacheInvalidate")
    pid = project["id"]

    task_resp = await client.post(
        "/api/tasks",
        json={"project_id": pid, "title": "Task for dashboard", "priority": "MEDIUM"},
        headers=headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["data"]["id"]

    r1 = await client.get(f"/api/projects/{pid}/dashboard", headers=headers)
    assert r1.status_code == 200

    await client.patch(
        f"/api/tasks/{task_id}/status",
        json={"status": "DONE"},
        headers=headers,
    )

    r2 = await client.get(f"/api/projects/{pid}/dashboard", headers=headers)
    assert r2.status_code == 200


# ── Members ────────────────────────────────────────────────────────────────────

async def test_add_and_remove_member_full_cycle(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]
    project = await _create_project(client, admin_headers, name="MemberCycle")
    pid = project["id"]

    add_resp = await client.post(
        f"/api/projects/{pid}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )
    assert add_resp.status_code == 201

    dup_resp = await client.post(
        f"/api/projects/{pid}/members",
        json={"user_id": emp_id, "role": "MEMBER"},
        headers=admin_headers,
    )
    assert dup_resp.status_code == 400

    del_resp = await client.delete(f"/api/projects/{pid}/members/{emp_id}", headers=admin_headers)
    assert del_resp.status_code == 204


async def test_add_member_as_viewer(client: AsyncClient):
    admin_headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    emp_headers = await _login(client, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    emp_id = (await _me(client, emp_headers))["id"]
    project = await _create_project(client, admin_headers)

    resp = await client.post(
        f"/api/projects/{project['id']}/members",
        json={"user_id": emp_id, "role": "VIEWER"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["role"] == "VIEWER"


# ── Sprint management ──────────────────────────────────────────────────────────

async def test_create_sprint_default_status_planning(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="SprintCreate")
    pid = project["id"]

    resp = await client.post(
        f"/api/projects/{pid}/sprints",
        json={"project_id": pid, "name": "Sprint Alpha"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["status"] == "PLANNING"


async def test_activate_sprint(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="SprintActivate")
    pid = project["id"]

    s = await client.post(
        f"/api/projects/{pid}/sprints",
        json={"project_id": pid, "name": "Sprint A"},
        headers=headers,
    )
    sprint_id = s.json()["data"]["id"]

    act = await client.put(
        f"/api/projects/{pid}/sprints/{sprint_id}/activate",
        headers=headers,
    )
    assert act.status_code == 200
    assert act.json()["data"]["status"] == "ACTIVE"


async def test_only_one_active_sprint_per_project(client: AsyncClient):
    headers = await _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    project = await _create_project(client, headers, name="OneActiveSprint")
    pid = project["id"]

    s1 = await client.post(
        f"/api/projects/{pid}/sprints",
        json={"project_id": pid, "name": "S1"},
        headers=headers,
    )
    s2 = await client.post(
        f"/api/projects/{pid}/sprints",
        json={"project_id": pid, "name": "S2"},
        headers=headers,
    )
    id1, id2 = s1.json()["data"]["id"], s2.json()["data"]["id"]

    await client.put(f"/api/projects/{pid}/sprints/{id1}/activate", headers=headers)
    await client.put(f"/api/projects/{pid}/sprints/{id2}/activate", headers=headers)

    list_resp = await client.get(f"/api/projects/{pid}/sprints", headers=headers)
    active = [s for s in list_resp.json()["data"] if s["status"] == "ACTIVE"]
    assert len(active) == 1
    assert active[0]["id"] == id2
