"""文件上传记录 — 每次上传一条记录，内容去重下沉到 Fingerprint"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.infrastructure.storage.entity.Fingerprint import Fingerprint


class FileRecord(Base):
    __tablename__ = "file_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fingerprint_id: Mapped[int] = mapped_column(
        ForeignKey("fingerprints.id"), nullable=False, comment="内容指纹（去重在这层）"
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(128), default="application/octet-stream", nullable=False
    )
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, comment="上传者，系统上传可为空"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    fingerprint: Mapped[Fingerprint] = relationship("Fingerprint", lazy="selectin")

    def __repr__(self) -> str:
        return f"<FileRecord id={self.id} filename='{self.filename}'>"
