"""add version_files + refactor download_versions

Revision ID: 17ac3e7949fd
Revises: 608d25181e60
Create Date: 2026-05-22 13:18:18.802701

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '17ac3e7949fd'
down_revision: Union[str, Sequence[str], None] = '608d25181e60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create version_files table
    op.create_table('version_files',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('version_id', sa.Integer(), nullable=False),
        sa.Column('relative_path', sa.String(length=512), nullable=False),
        sa.Column('fingerprint_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['fingerprint_id'], ['fingerprints.id'], ),
        sa.ForeignKeyConstraint(['version_id'], ['download_versions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Add is_mandatory column with server_default so existing rows work
    op.add_column('download_versions',
        sa.Column('is_mandatory', sa.Boolean(), nullable=False, server_default=sa.text('0'))
    )

    # Remove file_url and file_size
    op.drop_column('download_versions', 'file_url')
    op.drop_column('download_versions', 'file_size')


def downgrade() -> None:
    """Downgrade schema."""
    # Restore file_url and file_size
    op.add_column('download_versions',
        sa.Column('file_size', mysql.INTEGER(), autoincrement=False, nullable=True)
    )
    op.add_column('download_versions',
        sa.Column('file_url', mysql.VARCHAR(length=500), nullable=False, server_default=sa.text("''"))
    )

    # Remove is_mandatory
    op.drop_column('download_versions', 'is_mandatory')

    # Drop version_files table
    op.drop_table('version_files')
