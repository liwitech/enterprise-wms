"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. PostgreSQL enum types ──────────────────────────────────────────────
    op.execute("CREATE TYPE userroleenum AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE')")
    op.execute("CREATE TYPE scopetypeenum AS ENUM ('ORG', 'DEPT', 'PROJECT')")
    op.execute("CREATE TYPE projecttypeenum AS ENUM ('WATERFALL', 'AGILE', 'MIXED')")
    op.execute("CREATE TYPE projectstatusenum AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED')")
    op.execute("CREATE TYPE priorityenum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')")
    op.execute("CREATE TYPE sprintstatusenum AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED')")
    op.execute("CREATE TYPE milestonestatusenum AS ENUM ('PENDING', 'ACHIEVED', 'MISSED')")
    op.execute("CREATE TYPE projectmemberroleenum AS ENUM ('PM', 'MEMBER', 'VIEWER')")
    op.execute("CREATE TYPE taskstatusenum AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED')")
    op.execute("CREATE TYPE timesheetstatusenum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')")

    # ── 2. organizations ──────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE organizations (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        VARCHAR(255) NOT NULL,
            code        VARCHAR(50)  NOT NULL UNIQUE,
            logo_url    VARCHAR(500),
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_organizations_code ON organizations (code)")

    # ── 3. departments (without manager_user_id FK — circular ref resolved later) ──
    op.execute("""
        CREATE TABLE departments (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES organizations(id),
            parent_dept_id  UUID REFERENCES departments(id),
            name            VARCHAR(255) NOT NULL,
            code            VARCHAR(50)  NOT NULL,
            manager_user_id UUID,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_departments_org_id ON departments (org_id)")
    op.execute("CREATE INDEX ix_departments_parent_dept_id ON departments (parent_dept_id)")

    # ── 4. users ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE users (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id          UUID NOT NULL REFERENCES organizations(id),
            dept_id         UUID REFERENCES departments(id),
            email           VARCHAR(255) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            full_name       VARCHAR(255) NOT NULL,
            avatar_url      VARCHAR(500),
            employee_code   VARCHAR(50) UNIQUE,
            role            userroleenum NOT NULL DEFAULT 'EMPLOYEE',
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX ix_users_org_id ON users (org_id)")
    op.execute("CREATE INDEX ix_users_dept_id ON users (dept_id)")
    op.execute("CREATE INDEX ix_users_email ON users (email)")

    # ── 5. Add circular FK: departments.manager_user_id → users ──────────────
    op.execute("""
        ALTER TABLE departments
            ADD CONSTRAINT fk_dept_manager
            FOREIGN KEY (manager_user_id) REFERENCES users(id)
    """)

    # ── 6. user_roles ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE user_roles (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES users(id),
            role_type   VARCHAR(50) NOT NULL,
            scope_type  scopetypeenum NOT NULL,
            scope_id    UUID NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_user_roles_user_id ON user_roles (user_id)")

    # ── 7. projects ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE projects (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id           UUID NOT NULL REFERENCES organizations(id),
            dept_id          UUID REFERENCES departments(id),
            code             VARCHAR(50) NOT NULL UNIQUE,
            name             VARCHAR(255) NOT NULL,
            description      TEXT,
            project_type     projecttypeenum  NOT NULL DEFAULT 'WATERFALL',
            status           projectstatusenum NOT NULL DEFAULT 'PLANNING',
            priority         priorityenum     NOT NULL DEFAULT 'MEDIUM',
            start_date       DATE,
            end_date         DATE,
            progress_percent FLOAT NOT NULL DEFAULT 0.0,
            owner_user_id    UUID NOT NULL REFERENCES users(id),
            created_by       UUID NOT NULL REFERENCES users(id),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at       TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX ix_projects_code    ON projects (code)")
    op.execute("CREATE INDEX ix_projects_status  ON projects (status)")
    op.execute("CREATE INDEX ix_projects_org_id  ON projects (org_id)")
    op.execute("CREATE INDEX ix_projects_dept_id ON projects (dept_id)")

    # ── 8. project_members ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE project_members (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id  UUID NOT NULL REFERENCES projects(id),
            user_id     UUID NOT NULL REFERENCES users(id),
            role        projectmemberroleenum NOT NULL DEFAULT 'MEMBER',
            joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_project_member UNIQUE (project_id, user_id)
        )
    """)
    op.execute("CREATE INDEX ix_project_members_project_id ON project_members (project_id)")
    op.execute("CREATE INDEX ix_project_members_user_id    ON project_members (user_id)")

    # ── 9. sprints ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE sprints (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id  UUID NOT NULL REFERENCES projects(id),
            name        VARCHAR(255) NOT NULL,
            goal        TEXT,
            start_date  DATE,
            end_date    DATE,
            status      sprintstatusenum NOT NULL DEFAULT 'PLANNING',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_sprints_project_id ON sprints (project_id)")

    # ── 10. milestones ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE milestones (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id  UUID NOT NULL REFERENCES projects(id),
            name        VARCHAR(255) NOT NULL,
            due_date    DATE,
            status      milestonestatusenum NOT NULL DEFAULT 'PENDING',
            description TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_milestones_project_id ON milestones (project_id)")

    # ── 11. task_groups ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE task_groups (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id  UUID NOT NULL REFERENCES projects(id),
            name        VARCHAR(255) NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            color       VARCHAR(20),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_task_groups_project_id ON task_groups (project_id)")

    # ── 12. tasks ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE tasks (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id       UUID NOT NULL REFERENCES projects(id),
            task_group_id    UUID REFERENCES task_groups(id),
            sprint_id        UUID REFERENCES sprints(id),
            parent_task_id   UUID REFERENCES tasks(id),
            title            VARCHAR(500) NOT NULL,
            description      TEXT,
            status           taskstatusenum NOT NULL DEFAULT 'TODO',
            priority         priorityenum   NOT NULL DEFAULT 'MEDIUM',
            assignee_user_id UUID REFERENCES users(id),
            reporter_user_id UUID REFERENCES users(id),
            start_date       DATE,
            due_date         DATE,
            estimated_hours  FLOAT,
            actual_hours     FLOAT DEFAULT 0.0,
            tags             JSONB,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at       TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX ix_tasks_project_status   ON tasks (project_id, status)")
    op.execute("CREATE INDEX ix_tasks_parent_task_id   ON tasks (parent_task_id)")
    op.execute("CREATE INDEX ix_tasks_assignee_user_id ON tasks (assignee_user_id)")

    # ── 13. task_comments ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE task_comments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id     UUID NOT NULL REFERENCES tasks(id),
            user_id     UUID NOT NULL REFERENCES users(id),
            content     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_task_comments_task_id ON task_comments (task_id)")
    op.execute("CREATE INDEX ix_task_comments_user_id ON task_comments (user_id)")

    # ── 14. task_attachments ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE task_attachments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id     UUID NOT NULL REFERENCES tasks(id),
            user_id     UUID NOT NULL REFERENCES users(id),
            file_name   VARCHAR(255) NOT NULL,
            file_url    VARCHAR(500) NOT NULL,
            file_size   INTEGER,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_task_attachments_task_id ON task_attachments (task_id)")

    # ── 15. timesheet_entries ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE timesheet_entries (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID NOT NULL REFERENCES users(id),
            task_id      UUID NOT NULL REFERENCES tasks(id),
            project_id   UUID NOT NULL REFERENCES projects(id),
            work_date    DATE NOT NULL,
            hours_logged NUMERIC(4, 2) NOT NULL,
            description  TEXT,
            status       timesheetstatusenum NOT NULL DEFAULT 'DRAFT',
            submitted_at TIMESTAMPTZ,
            approved_by  UUID REFERENCES users(id),
            approved_at  TIMESTAMPTZ,
            reject_reason TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_hours_logged_range CHECK (hours_logged > 0 AND hours_logged <= 24)
        )
    """)
    op.execute("CREATE INDEX ix_timesheet_user_date  ON timesheet_entries (user_id, work_date)")
    op.execute("CREATE INDEX ix_timesheet_project_id ON timesheet_entries (project_id)")
    op.execute("CREATE INDEX ix_timesheet_task_id    ON timesheet_entries (task_id)")

    # ── 16. update_updated_at_column() trigger function ───────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    """)
    op.execute("""
        CREATE TRIGGER trg_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    """)
    op.execute("""
        CREATE TRIGGER trg_tasks_updated_at
        BEFORE UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    """)

    # ── 17. update_project_progress() trigger ─────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_project_progress()
        RETURNS TRIGGER AS $$
        DECLARE
            v_project_id   UUID;
            v_total        INTEGER;
            v_done         INTEGER;
            v_progress     FLOAT;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_project_id := OLD.project_id;
            ELSE
                v_project_id := NEW.project_id;
            END IF;

            SELECT
                COUNT(*) FILTER (WHERE deleted_at IS NULL),
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'DONE')
            INTO v_total, v_done
            FROM tasks
            WHERE project_id = v_project_id;

            IF v_total = 0 THEN
                v_progress := 0.0;
            ELSE
                v_progress := (v_done::FLOAT / v_total::FLOAT) * 100.0;
            END IF;

            UPDATE projects
               SET progress_percent = v_progress
             WHERE id = v_project_id;

            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trg_tasks_project_progress
        AFTER INSERT OR UPDATE OR DELETE ON tasks
        FOR EACH ROW EXECUTE FUNCTION update_project_progress()
    """)

    # ── 18. update_task_actual_hours() trigger ────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION update_task_actual_hours()
        RETURNS TRIGGER AS $$
        DECLARE
            v_task_id   UUID;
            v_total     NUMERIC;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_task_id := OLD.task_id;
            ELSE
                v_task_id := NEW.task_id;
            END IF;

            SELECT COALESCE(SUM(hours_logged), 0)
            INTO v_total
            FROM timesheet_entries
            WHERE task_id = v_task_id
              AND status <> 'REJECTED';

            UPDATE tasks
               SET actual_hours = v_total
             WHERE id = v_task_id;

            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trg_timesheet_actual_hours
        AFTER INSERT OR UPDATE OR DELETE ON timesheet_entries
        FOR EACH ROW EXECUTE FUNCTION update_task_actual_hours()
    """)

    # ── 19. timesheet_summary VIEW ────────────────────────────────────────────
    op.execute("""
        CREATE VIEW timesheet_summary AS
        SELECT
            te.user_id,
            u.full_name                              AS user_name,
            te.project_id,
            p.name                                   AS project_name,
            DATE_TRUNC('week', te.work_date)::DATE   AS week_start,
            SUM(te.hours_logged)                     AS total_hours,
            COUNT(DISTINCT te.task_id)               AS task_count,
            COUNT(te.id)                             AS entry_count
        FROM timesheet_entries te
        JOIN users    u ON u.id = te.user_id
        JOIN projects p ON p.id = te.project_id
        GROUP BY te.user_id, u.full_name, te.project_id, p.name,
                 DATE_TRUNC('week', te.work_date)
    """)


def downgrade() -> None:
    # Drop view
    op.execute("DROP VIEW IF EXISTS timesheet_summary")

    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS trg_timesheet_actual_hours ON timesheet_entries")
    op.execute("DROP TRIGGER IF EXISTS trg_tasks_project_progress ON tasks")
    op.execute("DROP TRIGGER IF EXISTS trg_tasks_updated_at    ON tasks")
    op.execute("DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects")
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at    ON users")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS update_task_actual_hours()")
    op.execute("DROP FUNCTION IF EXISTS update_project_progress()")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    # Drop tables in reverse dependency order
    op.execute("DROP TABLE IF EXISTS timesheet_entries")
    op.execute("DROP TABLE IF EXISTS task_attachments")
    op.execute("DROP TABLE IF EXISTS task_comments")
    op.execute("DROP TABLE IF EXISTS tasks")
    op.execute("DROP TABLE IF EXISTS task_groups")
    op.execute("DROP TABLE IF EXISTS milestones")
    op.execute("DROP TABLE IF EXISTS sprints")
    op.execute("DROP TABLE IF EXISTS project_members")
    op.execute("DROP TABLE IF EXISTS projects")
    op.execute("DROP TABLE IF EXISTS user_roles")

    # Remove circular FK before dropping users/departments
    op.execute("ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_dept_manager")

    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS departments")
    op.execute("DROP TABLE IF EXISTS organizations")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS timesheetstatusenum")
    op.execute("DROP TYPE IF EXISTS taskstatusenum")
    op.execute("DROP TYPE IF EXISTS projectmemberroleenum")
    op.execute("DROP TYPE IF EXISTS milestonestatusenum")
    op.execute("DROP TYPE IF EXISTS sprintstatusenum")
    op.execute("DROP TYPE IF EXISTS priorityenum")
    op.execute("DROP TYPE IF EXISTS projectstatusenum")
    op.execute("DROP TYPE IF EXISTS projecttypeenum")
    op.execute("DROP TYPE IF EXISTS scopetypeenum")
    op.execute("DROP TYPE IF EXISTS userroleenum")
