"""
Seed script for enterprise-wms.

Run with:
    python -m app.db.seed
"""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import update

from app.db.session import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.enums import (
    UserRoleEnum,
    ProjectTypeEnum,
    ProjectStatusEnum,
    PriorityEnum,
    ProjectMemberRoleEnum,
    TaskStatusEnum,
    TimesheetStatusEnum,
)
from app.models.organization import Organization
from app.models.department import Department
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.task_group import TaskGroup
from app.models.task import Task
from app.models.timesheet import TimesheetEntry


# ── Fixed IDs ─────────────────────────────────────────────────────────────────

ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

DEPT_ENG_ID = uuid.UUID("de000000-0000-0000-0000-000000000001")
DEPT_DES_ID = uuid.UUID("de000000-0000-0000-0000-000000000002")
DEPT_PM_ID  = uuid.UUID("de000000-0000-0000-0000-000000000003")

TODAY = date(2026, 6, 4)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_weekday(d: date) -> bool:
    return d.weekday() < 5  # Mon–Fri


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    async with AsyncSessionLocal() as session:
        async with session.begin():

            # ── Organization ──────────────────────────────────────────────────
            org = Organization(
                id=ORG_ID,
                name="Tech Solutions Vietnam JSC",
                code="TSV",
            )
            session.add(org)
            await session.flush()
            print(f"  Created organization: {org.name}")

            # ── Departments ───────────────────────────────────────────────────
            dept_eng = Department(
                id=DEPT_ENG_ID,
                org_id=ORG_ID,
                name="Engineering",
                code="ENG",
                parent_dept_id=None,
            )
            dept_des = Department(
                id=DEPT_DES_ID,
                org_id=ORG_ID,
                name="Design & UX",
                code="DES",
                parent_dept_id=None,
            )
            dept_pm = Department(
                id=DEPT_PM_ID,
                org_id=ORG_ID,
                name="Product Management",
                code="PM",
                parent_dept_id=None,
            )
            session.add_all([dept_eng, dept_des, dept_pm])
            await session.flush()
            print(f"  Created 3 departments")

            # ── Users ─────────────────────────────────────────────────────────
            pw = get_password_hash("Password123!")

            user_admin = User(
                org_id=ORG_ID, dept_id=None,
                email="admin@tsv.vn", hashed_password=pw,
                full_name="System Administrator",
                role=UserRoleEnum.SUPER_ADMIN, is_active=True,
            )
            user_hr = User(
                org_id=ORG_ID, dept_id=None,
                email="hr@tsv.vn", hashed_password=pw,
                full_name="HR Admin",
                role=UserRoleEnum.ADMIN, is_active=True,
            )
            user_eng_mgr = User(
                org_id=ORG_ID, dept_id=DEPT_ENG_ID,
                email="eng.manager@tsv.vn", hashed_password=pw,
                full_name="Nguyễn Văn Engineering Manager",
                role=UserRoleEnum.MANAGER, is_active=True,
            )
            user_des_mgr = User(
                org_id=ORG_ID, dept_id=DEPT_DES_ID,
                email="des.manager@tsv.vn", hashed_password=pw,
                full_name="Trần Thị Design Manager",
                role=UserRoleEnum.MANAGER, is_active=True,
            )
            user_pm_mgr = User(
                org_id=ORG_ID, dept_id=DEPT_PM_ID,
                email="pm.manager@tsv.vn", hashed_password=pw,
                full_name="Lê Văn Product Manager",
                role=UserRoleEnum.MANAGER, is_active=True,
            )
            user_dev1 = User(
                org_id=ORG_ID, dept_id=DEPT_ENG_ID,
                email="dev1@tsv.vn", hashed_password=pw,
                full_name="Phạm Văn Dev",
                role=UserRoleEnum.EMPLOYEE, is_active=True,
            )
            user_dev2 = User(
                org_id=ORG_ID, dept_id=DEPT_ENG_ID,
                email="dev2@tsv.vn", hashed_password=pw,
                full_name="Hoàng Thị Dev",
                role=UserRoleEnum.EMPLOYEE, is_active=True,
            )
            user_designer = User(
                org_id=ORG_ID, dept_id=DEPT_DES_ID,
                email="designer@tsv.vn", hashed_password=pw,
                full_name="Vũ Thị Designer",
                role=UserRoleEnum.EMPLOYEE, is_active=True,
            )
            user_po = User(
                org_id=ORG_ID, dept_id=DEPT_PM_ID,
                email="po@tsv.vn", hashed_password=pw,
                full_name="Đỗ Văn PO",
                role=UserRoleEnum.EMPLOYEE, is_active=True,
            )
            user_ba = User(
                org_id=ORG_ID, dept_id=DEPT_PM_ID,
                email="ba@tsv.vn", hashed_password=pw,
                full_name="Ngô Thị BA",
                role=UserRoleEnum.EMPLOYEE, is_active=True,
            )

            all_users = [
                user_admin, user_hr,
                user_eng_mgr, user_des_mgr, user_pm_mgr,
                user_dev1, user_dev2,
                user_designer,
                user_po, user_ba,
            ]
            session.add_all(all_users)
            await session.flush()
            print(f"  Created {len(all_users)} users")

            # ── Update department managers ─────────────────────────────────────
            dept_eng.manager_user_id = user_eng_mgr.id
            dept_des.manager_user_id = user_des_mgr.id
            dept_pm.manager_user_id  = user_pm_mgr.id
            await session.flush()
            print("  Updated department manager_user_ids")

            # ── Projects ──────────────────────────────────────────────────────
            proj_web = Project(
                org_id=ORG_ID, dept_id=DEPT_ENG_ID,
                code="TSV-WEB", name="Company Website Redesign",
                project_type=ProjectTypeEnum.WATERFALL,
                status=ProjectStatusEnum.IN_PROGRESS,
                priority=PriorityEnum.HIGH,
                start_date=date(2026, 1, 15), end_date=date(2026, 8, 31),
                owner_user_id=user_eng_mgr.id, created_by=user_eng_mgr.id,
            )
            proj_app = Project(
                org_id=ORG_ID, dept_id=DEPT_PM_ID,
                code="TSV-APP", name="Mobile App Development",
                project_type=ProjectTypeEnum.AGILE,
                status=ProjectStatusEnum.IN_PROGRESS,
                priority=PriorityEnum.CRITICAL,
                start_date=date(2026, 2, 1), end_date=date(2026, 12, 31),
                owner_user_id=user_pm_mgr.id, created_by=user_pm_mgr.id,
            )
            proj_erp = Project(
                org_id=ORG_ID, dept_id=DEPT_ENG_ID,
                code="TSV-ERP", name="ERP System Integration",
                project_type=ProjectTypeEnum.MIXED,
                status=ProjectStatusEnum.PLANNING,
                priority=PriorityEnum.HIGH,
                start_date=date(2026, 7, 1), end_date=date(2027, 6, 30),
                owner_user_id=user_eng_mgr.id, created_by=user_eng_mgr.id,
            )
            proj_ds = Project(
                org_id=ORG_ID, dept_id=DEPT_DES_ID,
                code="TSV-DS", name="Design System v2",
                project_type=ProjectTypeEnum.AGILE,
                status=ProjectStatusEnum.IN_PROGRESS,
                priority=PriorityEnum.MEDIUM,
                start_date=date(2026, 3, 1), end_date=date(2026, 9, 30),
                owner_user_id=user_des_mgr.id, created_by=user_des_mgr.id,
            )
            proj_sec = Project(
                org_id=ORG_ID, dept_id=None,
                code="TSV-SEC", name="Security Audit Q3",
                project_type=ProjectTypeEnum.WATERFALL,
                status=ProjectStatusEnum.PLANNING,
                priority=PriorityEnum.CRITICAL,
                start_date=date(2026, 7, 1), end_date=date(2026, 9, 30),
                owner_user_id=user_admin.id, created_by=user_admin.id,
            )

            all_projects = [proj_web, proj_app, proj_erp, proj_ds, proj_sec]
            session.add_all(all_projects)
            await session.flush()
            print(f"  Created {len(all_projects)} projects")

            # ── Project Members ───────────────────────────────────────────────
            members: list[ProjectMember] = []

            def add_member(project: Project, user: User, role: ProjectMemberRoleEnum = ProjectMemberRoleEnum.MEMBER) -> None:
                members.append(ProjectMember(project_id=project.id, user_id=user.id, role=role))

            # TSV-WEB
            add_member(proj_web, user_eng_mgr, ProjectMemberRoleEnum.PM)
            add_member(proj_web, user_dev1)
            add_member(proj_web, user_dev2)
            add_member(proj_web, user_designer)
            add_member(proj_web, user_po, ProjectMemberRoleEnum.VIEWER)

            # TSV-APP
            add_member(proj_app, user_pm_mgr, ProjectMemberRoleEnum.PM)
            add_member(proj_app, user_dev1)
            add_member(proj_app, user_dev2)
            add_member(proj_app, user_designer)
            add_member(proj_app, user_po)
            add_member(proj_app, user_ba)

            # TSV-ERP
            add_member(proj_erp, user_eng_mgr, ProjectMemberRoleEnum.PM)
            add_member(proj_erp, user_dev1)
            add_member(proj_erp, user_dev2)
            add_member(proj_erp, user_ba, ProjectMemberRoleEnum.VIEWER)

            # TSV-DS
            add_member(proj_ds, user_des_mgr, ProjectMemberRoleEnum.PM)
            add_member(proj_ds, user_designer)
            add_member(proj_ds, user_po, ProjectMemberRoleEnum.VIEWER)

            # TSV-SEC
            add_member(proj_sec, user_admin, ProjectMemberRoleEnum.PM)
            add_member(proj_sec, user_hr)
            add_member(proj_sec, user_eng_mgr)

            session.add_all(members)
            await session.flush()
            print(f"  Created {len(members)} project members")

            # ── Task Groups (3 per project) ───────────────────────────────────
            task_groups: list[TaskGroup] = []
            group_map: dict[uuid.UUID, dict[str, TaskGroup]] = {}

            group_configs = [
                ("Backlog",     0, "#6B7280"),
                ("In Progress", 1, "#3B82F6"),
                ("Done",        2, "#10B981"),
            ]

            for proj in all_projects:
                group_map[proj.id] = {}
                for gname, gidx, gcolor in group_configs:
                    tg = TaskGroup(
                        project_id=proj.id,
                        name=gname,
                        order_index=gidx,
                        color=gcolor,
                    )
                    task_groups.append(tg)
                    group_map[proj.id][gname] = tg

            session.add_all(task_groups)
            await session.flush()
            print(f"  Created {len(task_groups)} task groups")

            # ── Tasks (6 per project) ─────────────────────────────────────────
            # status → task group mapping
            status_to_group = {
                TaskStatusEnum.TODO:        "Backlog",
                TaskStatusEnum.IN_PROGRESS: "In Progress",
                TaskStatusEnum.IN_REVIEW:   "In Progress",
                TaskStatusEnum.DONE:        "Done",
            }

            tasks_data = {
                proj_web.id: [
                    ("Design homepage mockup",         TaskStatusEnum.TODO,        PriorityEnum.HIGH,     user_designer.id, user_eng_mgr.id, 8.0),
                    ("Setup CI/CD pipeline",           TaskStatusEnum.TODO,        PriorityEnum.MEDIUM,   user_dev1.id,     user_eng_mgr.id, 4.0),
                    ("Implement responsive navbar",    TaskStatusEnum.IN_PROGRESS, PriorityEnum.HIGH,     user_dev1.id,     user_eng_mgr.id, 12.0),
                    ("Migrate content to CMS",         TaskStatusEnum.IN_PROGRESS, PriorityEnum.MEDIUM,   user_dev2.id,     user_eng_mgr.id, 16.0),
                    ("Cross-browser QA testing",       TaskStatusEnum.IN_REVIEW,   PriorityEnum.HIGH,     user_dev2.id,     user_eng_mgr.id, 8.0),
                    ("Deploy staging environment",     TaskStatusEnum.DONE,        PriorityEnum.CRITICAL, user_dev1.id,     user_eng_mgr.id, 6.0),
                ],
                proj_app.id: [
                    ("Write user story backlog",       TaskStatusEnum.TODO,        PriorityEnum.MEDIUM,   user_po.id,       user_pm_mgr.id,  4.0),
                    ("Setup React Native project",     TaskStatusEnum.TODO,        PriorityEnum.HIGH,     user_dev2.id,     user_pm_mgr.id,  8.0),
                    ("Implement auth flow",            TaskStatusEnum.IN_PROGRESS, PriorityEnum.CRITICAL, user_dev1.id,     user_pm_mgr.id,  16.0),
                    ("Design onboarding screens",      TaskStatusEnum.IN_PROGRESS, PriorityEnum.HIGH,     user_designer.id, user_pm_mgr.id,  12.0),
                    ("API integration for home feed",  TaskStatusEnum.IN_REVIEW,   PriorityEnum.HIGH,     user_dev2.id,     user_pm_mgr.id,  10.0),
                    ("Sprint 1 retrospective doc",     TaskStatusEnum.DONE,        PriorityEnum.LOW,      user_ba.id,       user_pm_mgr.id,  4.0),
                ],
                proj_erp.id: [
                    ("Gather ERP requirements",        TaskStatusEnum.TODO,        PriorityEnum.HIGH,     user_ba.id,       user_eng_mgr.id, 8.0),
                    ("Vendor evaluation matrix",       TaskStatusEnum.TODO,        PriorityEnum.MEDIUM,   user_eng_mgr.id,  user_eng_mgr.id, 6.0),
                    ("Define integration architecture",TaskStatusEnum.IN_PROGRESS, PriorityEnum.CRITICAL, user_dev1.id,     user_eng_mgr.id, 16.0),
                    ("PoC SAP connector",              TaskStatusEnum.IN_PROGRESS, PriorityEnum.HIGH,     user_dev2.id,     user_eng_mgr.id, 12.0),
                    ("Data migration plan",            TaskStatusEnum.IN_REVIEW,   PriorityEnum.HIGH,     user_ba.id,       user_eng_mgr.id, 8.0),
                    ("Kickoff presentation deck",      TaskStatusEnum.DONE,        PriorityEnum.MEDIUM,   user_eng_mgr.id,  user_eng_mgr.id, 4.0),
                ],
                proj_ds.id: [
                    ("Audit existing components",      TaskStatusEnum.TODO,        PriorityEnum.MEDIUM,   user_designer.id, user_des_mgr.id, 8.0),
                    ("Define token system",            TaskStatusEnum.TODO,        PriorityEnum.HIGH,     user_designer.id, user_des_mgr.id, 6.0),
                    ("Build Button component",         TaskStatusEnum.IN_PROGRESS, PriorityEnum.HIGH,     user_designer.id, user_des_mgr.id, 8.0),
                    ("Build Form components",          TaskStatusEnum.IN_PROGRESS, PriorityEnum.MEDIUM,   user_designer.id, user_des_mgr.id, 12.0),
                    ("Storybook documentation",        TaskStatusEnum.IN_REVIEW,   PriorityEnum.MEDIUM,   user_designer.id, user_des_mgr.id, 10.0),
                    ("Publish npm package v2.0.0",     TaskStatusEnum.DONE,        PriorityEnum.HIGH,     user_designer.id, user_des_mgr.id, 4.0),
                ],
                proj_sec.id: [
                    ("Scope definition document",      TaskStatusEnum.TODO,        PriorityEnum.HIGH,     user_hr.id,       user_admin.id,   4.0),
                    ("Asset inventory review",         TaskStatusEnum.TODO,        PriorityEnum.CRITICAL, user_eng_mgr.id,  user_admin.id,   8.0),
                    ("Pen test scheduling",            TaskStatusEnum.IN_PROGRESS, PriorityEnum.CRITICAL, user_admin.id,    user_admin.id,   6.0),
                    ("Compliance gap analysis",        TaskStatusEnum.IN_PROGRESS, PriorityEnum.HIGH,     user_hr.id,       user_admin.id,   12.0),
                    ("Remediation tracking sheet",     TaskStatusEnum.IN_REVIEW,   PriorityEnum.HIGH,     user_eng_mgr.id,  user_admin.id,   8.0),
                    ("Executive risk summary",         TaskStatusEnum.DONE,        PriorityEnum.MEDIUM,   user_admin.id,    user_admin.id,   4.0),
                ],
            }

            all_tasks: list[Task] = []
            project_tasks: dict[uuid.UUID, list[Task]] = {}

            for proj_id, task_list in tasks_data.items():
                project_tasks[proj_id] = []
                for title, status, priority, assignee_id, reporter_id, est_hours in task_list:
                    group_name = status_to_group.get(status, "Backlog")
                    tg = group_map[proj_id][group_name]
                    t = Task(
                        project_id=proj_id,
                        task_group_id=tg.id,
                        title=title,
                        status=status,
                        priority=priority,
                        assignee_user_id=assignee_id,
                        reporter_user_id=reporter_id,
                        estimated_hours=est_hours,
                        start_date=TODAY - timedelta(days=14),
                        due_date=TODAY + timedelta(days=30),
                    )
                    all_tasks.append(t)
                    project_tasks[proj_id].append(t)

            session.add_all(all_tasks)
            await session.flush()
            print(f"  Created {len(all_tasks)} tasks")

            # ── Timesheet Entries ─────────────────────────────────────────────
            workers = [user_dev1, user_dev2, user_designer, user_po]

            # Map worker → relevant (project_id, task_id) pairs
            worker_project_tasks: dict[uuid.UUID, list[tuple[uuid.UUID, uuid.UUID]]] = {
                user_dev1.id:     [],
                user_dev2.id:     [],
                user_designer.id: [],
                user_po.id:       [],
            }

            for proj in all_projects:
                for task in project_tasks[proj.id]:
                    if task.assignee_user_id in worker_project_tasks:
                        worker_project_tasks[task.assignee_user_id].append(
                            (proj.id, task.id)
                        )

            timesheet_entries: list[TimesheetEntry] = []

            for days_ago in range(14, 0, -1):
                work_date = TODAY - timedelta(days=days_ago)
                if not _is_weekday(work_date):
                    continue

                if days_ago > 7:
                    ts_status = TimesheetStatusEnum.APPROVED
                    submitted_at = datetime(
                        work_date.year, work_date.month, work_date.day,
                        18, 0, 0, tzinfo=timezone.utc
                    )
                    approved_at = submitted_at + timedelta(days=1)
                elif days_ago >= 4:
                    ts_status = TimesheetStatusEnum.SUBMITTED
                    submitted_at = datetime(
                        work_date.year, work_date.month, work_date.day,
                        18, 0, 0, tzinfo=timezone.utc
                    )
                    approved_at = None
                else:
                    ts_status = TimesheetStatusEnum.DRAFT
                    submitted_at = None
                    approved_at = None

                entry_count_for_day = 0
                for worker in workers:
                    pt_list = worker_project_tasks.get(worker.id, [])
                    if not pt_list:
                        continue

                    if entry_count_for_day >= 3:
                        break

                    proj_id, task_id = pt_list[days_ago % len(pt_list)]

                    hours_val = Decimal(str(round(1 + (days_ago % 7) * 1.0 + (workers.index(worker) * 0.5), 2)))
                    hours_val = min(hours_val, Decimal("8.00"))
                    hours_val = max(hours_val, Decimal("1.00"))

                    approver_id = user_eng_mgr.id if ts_status == TimesheetStatusEnum.APPROVED else None

                    te = TimesheetEntry(
                        user_id=worker.id,
                        task_id=task_id,
                        project_id=proj_id,
                        work_date=work_date,
                        hours_logged=hours_val,
                        description=f"Work on {work_date.isoformat()}",
                        status=ts_status,
                        submitted_at=submitted_at,
                        approved_by=approver_id,
                        approved_at=approved_at,
                    )
                    timesheet_entries.append(te)
                    entry_count_for_day += 1

            session.add_all(timesheet_entries)
            await session.flush()
            print(f"  Created {len(timesheet_entries)} timesheet entries")

        # ── Summary ───────────────────────────────────────────────────────────
        print("\n=== Seed Complete ===")
        print(f"  Organizations    : 1")
        print(f"  Departments      : 3")
        print(f"  Users            : {len(all_users)}")
        print(f"  Projects         : {len(all_projects)}")
        print(f"  ProjectMembers   : {len(members)}")
        print(f"  TaskGroups       : {len(task_groups)}")
        print(f"  Tasks            : {len(all_tasks)}")
        print(f"  TimesheetEntries : {len(timesheet_entries)}")


if __name__ == "__main__":
    asyncio.run(main())
