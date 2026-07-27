"""rename federation terminology to distributed

Revision ID: 5f16bd599fd7
Revises: 5e09240b84a1
Create Date: 2026-07-27 07:15:26.357648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f16bd599fd7'
down_revision: Union[str, None] = '5e09240b84a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table('cluster_federation_link', 'cluster_distributed_link')


def downgrade() -> None:
    op.rename_table('cluster_distributed_link', 'cluster_federation_link')
