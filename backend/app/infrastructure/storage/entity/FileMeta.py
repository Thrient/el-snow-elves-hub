"""文件元数据 — 指纹的翻译层，补充原始文件名等人类可读信息"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.infrastructure.storage.entity.Fingerprint import Fingerprint


class FileMeta(Base):
    __tablename__ = "file_metas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fingerprint_id: Mapped[int] = mapped_column(
        ForeignKey("fingerprints.id"), nullable=False, comment="内容指纹"
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    fingerprint: Mapped[Fingerprint] = relationship("Fingerprint", lazy="selectin")

    def __repr__(self) -> str:
        return f"<FileMeta id={self.id} filename='{self.filename}'>"
