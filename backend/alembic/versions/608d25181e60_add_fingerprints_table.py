"""add fingerprints table

Revision ID: 608d25181e60
Revises:
Create Date: 2026-05-22 13:11:36.531665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '608d25181e60'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('fingerprints',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sha256')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('fingerprints')
