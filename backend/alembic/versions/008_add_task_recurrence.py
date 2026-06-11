"""add task recurrence fields

Revision ID: 008
Revises: 007
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('is_recurring', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('tasks', sa.Column('recurrence_type', sa.String(20), nullable=True))
    op.add_column('tasks', sa.Column('recurrence_interval', sa.Integer(), nullable=True, server_default='1'))
    op.add_column('tasks', sa.Column('recurrence_days', JSONB(), nullable=True))
    op.add_column('tasks', sa.Column('recurrence_end_type', sa.String(10), nullable=True))
    op.add_column('tasks', sa.Column('recurrence_count', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('recurrence_until', sa.Date(), nullable=True))
    op.add_column('tasks', sa.Column(
        'recurrence_parent_id',
        PGUUID(as_uuid=True),
        sa.ForeignKey('tasks.id', ondelete='SET NULL'),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('tasks', 'recurrence_parent_id')
    op.drop_column('tasks', 'recurrence_until')
    op.drop_column('tasks', 'recurrence_count')
    op.drop_column('tasks', 'recurrence_end_type')
    op.drop_column('tasks', 'recurrence_days')
    op.drop_column('tasks', 'recurrence_interval')
    op.drop_column('tasks', 'recurrence_type')
    op.drop_column('tasks', 'is_recurring')
