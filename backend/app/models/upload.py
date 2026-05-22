"""断点续传 — 上传会话"""
from datetime import datetime, timezone, timedelta
import uuid

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def gen_upload_id() -> str:
    return uuid.uuid4().hex


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    upload_id: Mapped[str] = mapped_column(String(32), unique=True, default=gen_upload_id, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    total_size: Mapped[int] = mapped_column(Integer, nullable=False)
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_chunks: Mapped[list | None] = mapped_column(JSON, default=list)  # [0, 1, 2, ...]
    status: Mapped[str] = mapped_column(String(16), default="uploading")  # uploading | done | expired
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc) + timedelta(hours=24))
