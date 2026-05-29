"""版本文件清单 — 一个版本包含的文件列表"""
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.Database import Base


class VersionFile(Base):
    __tablename__ = "version_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("download_versions.id"), nullable=False
    )
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_record_id: Mapped[int] = mapped_column(
        ForeignKey("file_records.id"), nullable=False
    )
