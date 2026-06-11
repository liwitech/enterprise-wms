"""Add resource tracking fields to audit_logs

Revision ID: 004
Revises: 003
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("action", sa.String(50), nullable=True))
    op.add_column("audit_logs", sa.Column("resource_type", sa.String(100), nullable=True))
    op.add_column("audit_logs", sa.Column("resource_id", sa.String(255), nullable=True))
    op.add_column("audit_logs", sa.Column("old_value", JSONB, nullable=True))
    op.add_column("audit_logs", sa.Column("new_value", JSONB, nullable=True))
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_resource_type", "audit_logs", ["resource_type"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_resource_type", "audit_logs")
    op.drop_index("ix_audit_logs_action", "audit_logs")
    op.drop_column("audit_logs", "new_value")
    op.drop_column("audit_logs", "old_value")
    op.drop_column("audit_logs", "resource_id")
    op.drop_column("audit_logs", "resource_type")
    op.drop_column("audit_logs", "action")
