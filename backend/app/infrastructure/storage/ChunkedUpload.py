"""分块上传服务 — init / chunk / complete / cleanup"""
import hashlib
import logging
from datetime import datetime, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.Upload import Upload
from app.infrastructure.storage.MinioClient import client as minio
from app.infrastructure.storage.StorageService import storage_service

_log = logging.getLogger("Elves.ChunkedUpload")


class ChunkedUpload:
    """管理分块上传的完整生命周期"""

    async def init(self, db: AsyncSession, filename: str, total_size: int, total_chunks: int,
                   uploaded_by: int | None = None, sha256: str | None = None) -> Upload:
        # SHA256 resume: reuse existing session for same file
        if sha256:
            existing = (await db.execute(
                select(Upload).where(
                    Upload.sha256 == sha256,
                    Upload.status == "uploading",
                )
            )).scalar_one_or_none()
            if existing:
                return existing

        upload = Upload(
            filename=filename, total_size=total_size, total_chunks=total_chunks,
            uploaded_by=uploaded_by, sha256=sha256,
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

        # 记录 chunk SHA256
        chunk_hash = hashlib.sha256(data).hexdigest()
        hashes = dict(upload.chunk_hashes or {})
        hashes[str(n)] = chunk_hash
        upload.chunk_hashes = hashes

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

        from app.infrastructure.storage.entity.Fingerprint import Fingerprint
        from app.infrastructure.storage.FileValidator import detect_type

        # Stream all chunks from MinIO, accumulate full file SHA256
        h = hashlib.sha256()
        first_chunk_data: bytes | None = None
        for n in chunks:
            data, _ = minio.download(f"chunks/{upload_id}/{n}")
            h.update(data)
            if first_chunk_data is None:
                first_chunk_data = data
        full_hash = h.hexdigest()

        # Dedup
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == full_hash)
        )).scalar_one_or_none()

        if existing:
            fp = existing
        else:
            # Server-side merge (UploadPartCopy — data never hits backend)
            mp_id = minio.create_multipart_upload(full_hash)
            parts = []
            for i, n in enumerate(chunks, start=1):
                result = minio.upload_part_copy(
                    full_hash, mp_id, i, f"chunks/{upload_id}/{n}"
                )
                parts.append(result)
            minio.complete_multipart_upload(full_hash, mp_id, parts)

            detected = detect_type(first_chunk_data)
            fp = Fingerprint(sha256=full_hash, size=upload.total_size, detected_type=detected)
            db.add(fp)
            await db.flush()

        record = await storage_service.create_record(
            db, fp,
            filename=upload.filename,
            uploaded_by=upload.uploaded_by,
        )

        # Clean up chunks (best-effort)
        chunk_keys = [f"chunks/{upload_id}/{n}" for n in chunks]
        try:
            minio.delete_objects(chunk_keys)
        except Exception:
            _log.warning(f"分片清理失败，残留 {len(chunk_keys)} 个对象于 chunks/{upload_id}/")

        await db.delete(upload)
        await db.commit()

        return fp, record

    async def direct_upload(self, db: AsyncSession, filename: str, data: bytes, uploaded_by: int | None = None):
        """Small file direct upload — hash, dedup, store in one request"""
        from app.infrastructure.storage.entity.Fingerprint import Fingerprint
        from app.infrastructure.storage.FileValidator import detect_type

        sha256 = hashlib.sha256(data).hexdigest()

        # Dedup
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == sha256)
        )).scalar_one_or_none()

        if existing:
            fp = existing
        else:
            detected = detect_type(data)
            minio.upload(sha256, data, "application/octet-stream")
            fp = Fingerprint(sha256=sha256, size=len(data), detected_type=detected)
            db.add(fp)
            await db.flush()

        record = await storage_service.create_record(
            db, fp, filename=filename, uploaded_by=uploaded_by,
        )
        await db.commit()
        return record

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
            for n in (u.uploaded_chunks or []):
                try:
                    minio.delete(f"chunks/{u.upload_id}/{n}")
                except Exception:
                    pass
            await db.delete(u)
        if expired:
            await db.commit()
        return len(expired)


chunked_upload = ChunkedUpload()
