"""角色实体 — 用户通过角色获得权限"""
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.infrastructure.rbac.entity.Permission import Permission


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_scope: Mapped[str] = mapped_column(String(16), default="all", nullable=False)

    permissions: Mapped[list[Permission]] = relationship(
        secondary="role_permissions", lazy="selectin"
    )
