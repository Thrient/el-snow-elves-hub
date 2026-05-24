"""add orphan_tracker table

Revision ID: a1b2c3d4e5f6
Revises: 17ac3e7949fd
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '17ac3e7949fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('orphan_tracker',
        sa.Column('fingerprint_id', sa.Integer(), nullable=False),
        sa.Column('first_orphaned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('fingerprint_id'),
        sa.ForeignKeyConstraint(['fingerprint_id'], ['fingerprints.id'], ondelete='CASCADE'),
    )


def downgrade() -> None:
    op.drop_table('orphan_tracker')
