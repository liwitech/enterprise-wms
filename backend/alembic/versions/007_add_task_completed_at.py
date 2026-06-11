"""add task completed_at

Revision ID: 007
Revises: 006
Create Date: 2026-06-10
"""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill for existing DONE tasks using updated_at as best approximation
    op.execute(
        "UPDATE tasks SET completed_at = updated_at WHERE status = 'DONE' AND completed_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("tasks", "completed_at")
