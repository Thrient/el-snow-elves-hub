"""下载版本模型"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DownloadVersion(Base):
    __tablename__ = "download_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="Windows x64")
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    is_latest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
