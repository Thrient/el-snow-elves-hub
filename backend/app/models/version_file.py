from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VersionFile(Base):
    __tablename__ = "version_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("download_versions.id"), nullable=False)
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    fingerprint_id: Mapped[int] = mapped_column(ForeignKey("fingerprints.id"), nullable=False)
