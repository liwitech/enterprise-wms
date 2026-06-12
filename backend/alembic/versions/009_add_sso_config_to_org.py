"""add sso config to organizations

Revision ID: 009
Revises: 008
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('sso_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('organizations', sa.Column('sso_provider_url', sa.String(500), nullable=True))
    op.add_column('organizations', sa.Column('sso_client_id', sa.String(255), nullable=True))
    op.add_column('organizations', sa.Column('sso_client_secret', sa.String(500), nullable=True))
    op.add_column('organizations', sa.Column('sso_redirect_uri', sa.String(500), nullable=True))
    op.add_column('organizations', sa.Column('sso_verify_ssl', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('organizations', 'sso_verify_ssl')
    op.drop_column('organizations', 'sso_redirect_uri')
    op.drop_column('organizations', 'sso_client_secret')
    op.drop_column('organizations', 'sso_client_id')
    op.drop_column('organizations', 'sso_provider_url')
    op.drop_column('organizations', 'sso_enabled')
