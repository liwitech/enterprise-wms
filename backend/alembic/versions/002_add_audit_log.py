"""Add audit_log table

Revision ID: 002
Revises: 001
Create Date: 2026-06-04
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE audit_logs (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID,
            method      VARCHAR(10) NOT NULL,
            endpoint    VARCHAR(255) NOT NULL,
            status_code INTEGER     NOT NULL,
            duration_ms INTEGER     NOT NULL,
            ip_address  VARCHAR(45),
            user_agent  VARCHAR(500),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_audit_logs_user_id    ON audit_logs (user_id)")
    op.execute("CREATE INDEX ix_audit_logs_endpoint   ON audit_logs (endpoint)")
    op.execute("CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs")
