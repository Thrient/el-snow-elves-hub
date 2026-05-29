"""指纹孤儿追踪 — 记录引用计数归零的时间，用于延后清理"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.Database import Base


class OrphanTracker(Base):
    __tablename__ = "orphan_tracker"

    fingerprint_id: Mapped[int] = mapped_column(
        ForeignKey("fingerprints.id", ondelete="CASCADE"),
        primary_key=True,
    )
    first_orphaned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
