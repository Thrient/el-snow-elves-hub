"""任务版本实体"""
from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.infrastructure.Database import Base

class TaskVersion(Base):
    __tablename__ = "task_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")
    file_record_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("file_records.id"), nullable=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("task_id", "version", name="uq_task_version"),)
    task = relationship("Task", back_populates="versions")
    file_record = relationship("FileRecord", foreign_keys=[file_record_id], lazy="selectin")
