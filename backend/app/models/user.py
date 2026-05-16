"""用户模型"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_id: Mapped[int | None] = mapped_column(ForeignKey("files.id"), nullable=True)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    role: Mapped["Role | None"] = relationship("Role", lazy="selectin")
    avatar: Mapped["File | None"] = relationship("File", foreign_keys=[avatar_id], lazy="selectin")

    def has_permission(self, code: str) -> bool:
        """通过角色查权限"""
        if not self.role or not self.role.permissions:
            return False
        perms = {p.code for p in self.role.permissions}
        if "*" in perms:
            return True
        return code in perms

    @property
    def avatar_url(self) -> str | None:
        from app.utils.file_service import file_url
        return file_url(self.avatar) if self.avatar else None

    @property
    def role_name(self) -> str | None:
        return self.role.name if self.role else None

    @property
    def permissions(self) -> list | None:
        if not self.role or not self.role.permissions:
            return None
        return [p.code for p in self.role.permissions]
