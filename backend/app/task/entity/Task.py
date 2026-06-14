"""任务实体 — 社区发布的可下载脚本配置"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.task.entity.TaskVersion import TaskVersion


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="综合")
    tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_record_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("file_records.id"), nullable=True)
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    current_version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    status: Mapped[str] = mapped_column(String(16), default="published")
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    cover_record = relationship("FileRecord", foreign_keys=[cover_record_id], lazy="selectin")

    versions: Mapped[list["TaskVersion"]] = relationship(
        "TaskVersion", back_populates="task", lazy="selectin",
        order_by="TaskVersion.created_at.desc()", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Task id={self.id} title='{self.title}'>"
