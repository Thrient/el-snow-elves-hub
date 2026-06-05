"""审核记录 — 统一追踪 AI + 人工审核动作"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.identity.entity.User import User


class ReviewRecord(Base):
    __tablename__ = "review_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content_type: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True,
        comment="post | reply | task | comment"
    )
    content_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    reviewer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, comment="NULL=待审, 非空=审核人"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending",
        comment="pending | approved | rejected"
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True, comment="审核理由")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    reviewer: Mapped["User | None"] = relationship("User", lazy="selectin")
