from datetime import datetime
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.infrastructure.Database import Base


class UploadChunk(Base):
    __tablename__ = "upload_chunks"

    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    chunk_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    total_chunks: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
