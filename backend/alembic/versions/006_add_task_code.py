"""Add task_code sequence and column

Revision ID: 006
Revises: 005
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS task_code_seq START 1 INCREMENT 1")
    op.add_column("tasks", sa.Column("task_code", sa.String(20), nullable=True))
    op.execute(
        "UPDATE tasks SET task_code = 'TASK-' || LPAD(nextval('task_code_seq')::TEXT, 4, '0') WHERE task_code IS NULL"
    )
    op.alter_column("tasks", "task_code", nullable=False)
    op.create_unique_constraint("uq_tasks_task_code", "tasks", ["task_code"])
    op.create_index("ix_tasks_task_code", "tasks", ["task_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tasks_task_code", table_name="tasks")
    op.drop_constraint("uq_tasks_task_code", "tasks", type_="unique")
    op.drop_column("tasks", "task_code")
    op.execute("DROP SEQUENCE IF EXISTS task_code_seq")
