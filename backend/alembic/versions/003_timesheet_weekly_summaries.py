"""Add timesheet_weekly_summaries and tighten hours constraint

Revision ID: 003
Revises: 002
Create Date: 2026-06-04
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change max hours per entry from 24 → 16
    op.execute("ALTER TABLE timesheet_entries DROP CONSTRAINT ck_hours_logged_range")
    op.execute(
        "ALTER TABLE timesheet_entries ADD CONSTRAINT ck_hours_logged_range "
        "CHECK (hours_logged > 0 AND hours_logged <= 16)"
    )

    op.execute("""
        CREATE TABLE timesheet_weekly_summaries (
            id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id      UUID        NOT NULL REFERENCES users(id),
            project_id   UUID        NOT NULL REFERENCES projects(id),
            week_start   DATE        NOT NULL,
            total_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
            entry_count  INTEGER     NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_weekly_summary UNIQUE (user_id, project_id, week_start)
        )
    """)
    op.execute("CREATE INDEX ix_weekly_summary_user_id    ON timesheet_weekly_summaries (user_id)")
    op.execute("CREATE INDEX ix_weekly_summary_project_id ON timesheet_weekly_summaries (project_id)")
    op.execute("CREATE INDEX ix_weekly_summary_week_start ON timesheet_weekly_summaries (week_start)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS timesheet_weekly_summaries")
    op.execute("ALTER TABLE timesheet_entries DROP CONSTRAINT ck_hours_logged_range")
    op.execute(
        "ALTER TABLE timesheet_entries ADD CONSTRAINT ck_hours_logged_range "
        "CHECK (hours_logged > 0 AND hours_logged <= 24)"
    )
