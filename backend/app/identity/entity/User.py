"""用户实体 — 身份认证 + RBAC 角色关联"""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.storage.entity.FileRecord import FileRecord


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_record_id: Mapped[int | None] = mapped_column(
        ForeignKey("file_records.id"), nullable=True, comment="头像上传记录"
    )
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    is_disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    roles: Mapped[list[Role]] = relationship(secondary="user_roles", lazy="selectin")
    avatar_record: Mapped["FileRecord | None"] = relationship(
        "FileRecord", foreign_keys=[avatar_record_id], lazy="selectin"
    )

    def has_permission(self, code: str) -> bool:
        perms: set[str] = set()
        for role in self.roles:
            if not role.permissions:
                continue
            for p in role.permissions:
                perms.add(p.code)
        return "*" in perms or code in perms

    @property
    def avatar_url(self) -> str | None:
        if not self.avatar_record or not self.avatar_record.fingerprint:
            return None
        return f"/api/v1/files/{self.avatar_record.fingerprint.sha256}"

    @property
    def role_ids(self) -> list[int]:
        return [r.id for r in self.roles]

    @property
    def role_names(self) -> list[str]:
        return [r.name for r in self.roles]

    @property
    def permissions(self) -> list[str] | None:
        perms: set[str] = set()
        for role in self.roles:
            if not role.permissions:
                continue
            for p in role.permissions:
                perms.add(p.code)
        return list(perms) if perms else None
