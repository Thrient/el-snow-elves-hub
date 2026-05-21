"""RBAC 权限模型 — 用户 ↔ 角色 ↔ 权限"""

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# 统一权限码 — 菜单 / 按钮 / API 共用
PERMISSION_CODES = {
    "admin:access": "进入管理后台",

    "user:list": "查看用户列表",
    "user:assign": "分配角色",

    "role:list": "查看角色列表",
    "role:create": "创建角色",
    "role:update": "编辑角色权限",
    "role:delete": "删除角色",

    "perm:list": "查看权限列表",
    "perm:create": "创建权限",
    "perm:update": "编辑权限",
    "perm:delete": "删除权限",

    "route:list": "查看路由列表",
    "route:create": "创建路由",
    "route:update": "编辑路由",
    "route:delete": "删除路由",
    "route:toggle": "启停路由",

    "version:list": "查看版本列表",
    "version:download": "下载版本文件",
    "version:create": "创建版本",
    "version:delete": "删除版本",

    "task:list": "查看任务列表",
    "task:approve": "审核任务",
    "task:delete": "删除任务",

    "forum:list": "浏览论坛",
    "forum:post": "发帖回帖",
    "forum:delete": "删帖",
    "forum:manage": "管理板块",

    "comment:delete": "删除评论",
}

WILDCARD = "*"


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_scope: Mapped[str] = mapped_column(String(16), default="all", nullable=False)

    permissions: Mapped[list[Permission]] = relationship(
        secondary="role_permissions", lazy="selectin"
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
