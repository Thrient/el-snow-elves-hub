"""用户模型"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.rbac import Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_id: Mapped[int | None] = mapped_column(ForeignKey("fingerprints.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    roles: Mapped[list[Role]] = relationship(
        secondary="user_roles", lazy="selectin"
    )
    avatar: Mapped["Fingerprint | None"] = relationship("Fingerprint", foreign_keys=[avatar_id], lazy="selectin")

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
        from app.utils.fingerprint_service import file_url
        return file_url(self.avatar) if self.avatar else None

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
