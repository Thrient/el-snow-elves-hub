"""SHA256 内容寻址存储"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.Database import Base


class Fingerprint(Base):
    __tablename__ = "fingerprints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    detected_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    verified: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
