"""Add dept_type to departments

Revision ID: 005
Revises: 004
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "departments",
        sa.Column("dept_type", sa.String(20), nullable=True),
    )
    op.execute("UPDATE departments SET dept_type = 'PHONG' WHERE dept_type IS NULL")


def downgrade() -> None:
    op.drop_column("departments", "dept_type")
