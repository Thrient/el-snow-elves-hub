"""分块上传服务 — init / chunk / complete / cleanup"""
import io
from datetime import datetime, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.Upload import Upload
from app.infrastructure.storage.MinioClient import client as minio
from app.infrastructure.storage.StorageService import storage_service


class ChunkedUpload:
    """管理分块上传的完整生命周期"""

    async def init(self, db: AsyncSession, filename: str, total_size: int, total_chunks: int, uploaded_by: int | None = None) -> Upload:
        upload = Upload(
            filename=filename, total_size=total_size, total_chunks=total_chunks,
            uploaded_by=uploaded_by,
        )
        db.add(upload)
        await db.commit()
        return upload

    async def chunk(self, db: AsyncSession, upload_id: str, n: int, data: bytes) -> Upload:
        upload = (await db.execute(
            select(Upload).where(Upload.upload_id == upload_id)
        )).scalar_one_or_none()
        if not upload:
            raise ValueError("上传会话不存在或已过期")

        minio.upload(f"chunks/{upload_id}/{n}", data, "application/octet-stream")

        chunks = list(upload.uploaded_chunks or [])
        if n not in chunks:
            chunks.append(n)
        upload.uploaded_chunks = sorted(chunks)
        await db.commit()
        return upload

    async def complete(self, db: AsyncSession, upload_id: str):
        upload = (await db.execute(
            select(Upload).where(Upload.upload_id == upload_id)
        )).scalar_one_or_none()
        if not upload:
            raise ValueError("上传会话不存在或已过期")

        chunks = sorted(upload.uploaded_chunks or [])
        if len(chunks) != upload.total_chunks:
            raise ValueError(f"分片未完整: {len(chunks)}/{upload.total_chunks}")

        buf = io.BytesIO()
        for n in chunks:
            data, _ = minio.download(f"chunks/{upload_id}/{n}")
            buf.write(data)

        fp = await storage_service.store(db, buf.getvalue())

        for n in chunks:
            try:
                minio.delete(f"chunks/{upload_id}/{n}")
            except Exception:
                pass

        await db.delete(upload)
        await db.commit()
        return fp

    async def cleanup_expired(self, db: AsyncSession) -> int:
        """清理过期的上传会话及分片，返回清理数量"""
        result = await db.execute(
            select(Upload).where(
                and_(
                    Upload.status.in_(["uploading", "done"]),
                    Upload.expires_at < datetime.now(timezone.utc),
                )
            )
        )
        expired = result.scalars().all()
        for u in expired:
            for n in range(u.total_chunks):
                try:
                    minio.delete(f"chunks/{u.upload_id}/{n}")
                except Exception:
                    pass
            await db.delete(u)
        if expired:
            await db.commit()
        return len(expired)


chunked_upload = ChunkedUpload()
