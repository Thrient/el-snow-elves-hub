"""论坛帖子 — 自引用支持楼中楼回复"""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.Database import Base
from app.forum.entity.ForumBoard import ForumBoard
from app.identity.entity.User import User


class ForumPost(Base):
    __tablename__ = "forum_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("forum_boards.id"), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("forum_posts.id"), nullable=True)
    thread_id: Mapped[int | None] = mapped_column(
        ForeignKey("forum_posts.id"), nullable=True, comment="根帖子 ID"
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    image_ids: Mapped[list | None] = mapped_column(JSON, default=list)
    last_reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped["User"] = relationship("User", lazy="selectin")
    board: Mapped["ForumBoard"] = relationship(
        "ForumBoard", foreign_keys=[board_id], lazy="selectin"
    )
    parent: Mapped[Optional["ForumPost"]] = relationship(
        "ForumPost", remote_side=[id], foreign_keys=[parent_id],
        back_populates="replies", lazy="selectin",
    )
    replies: Mapped[list["ForumPost"]] = relationship(
        "ForumPost", foreign_keys=[parent_id], back_populates="parent",
        lazy="selectin", order_by="ForumPost.created_at",
    )
