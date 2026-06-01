"""分块上传服务 — init / chunk / complete / cleanup"""
import hashlib
import io
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

    async def complete(self, db: AsyncSession, upload_id: str, sha256: str):
        upload = (await db.execute(
            select(Upload).where(Upload.upload_id == upload_id)
        )).scalar_one_or_none()
        if not upload:
            raise ValueError("上传会话不存在或已过期")

        chunks = sorted(upload.uploaded_chunks or [])
        if len(chunks) != upload.total_chunks:
            raise ValueError(f"分片未完整: {len(chunks)}/{upload.total_chunks}")

        from app.infrastructure.storage.entity.Fingerprint import Fingerprint

        # 去重：sha256 已存在则跳过合并
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == sha256)
        )).scalar_one_or_none()

        if existing:
            fp = existing
        else:
            # 服务端合并（UploadPartCopy，数据不经过后端）
            mp_id = minio.create_multipart_upload(sha256)
            parts = []
            for i, n in enumerate(chunks, start=1):
                result = minio.upload_part_copy(
                    sha256, mp_id, i, f"chunks/{upload_id}/{n}"
                )
                parts.append(result)
            minio.complete_multipart_upload(sha256, mp_id, parts)

            fp = Fingerprint(sha256=sha256, size=upload.total_size)
            db.add(fp)
            await db.flush()

        record = await storage_service.create_record(
            db, fp,
            filename=upload.filename,
            uploaded_by=upload.uploaded_by,
        )

        # 批量删除分片
        chunk_keys = [f"chunks/{upload_id}/{n}" for n in chunks]
        minio.delete_objects(chunk_keys)

        await db.delete(upload)
        await db.commit()

        # 异步验证 SHA256（后台任务，不阻塞返回）
        import asyncio
        asyncio.create_task(self._verify_sha256(sha256))

        return fp, record

    async def _verify_sha256(self, sha256: str):
        """后台异步：下载文件验证 SHA256 是否匹配"""
        import hashlib as hl
        from app.infrastructure.Database import async_session
        from app.infrastructure.storage.entity.Fingerprint import Fingerprint
        try:
            data, _ = minio.download(sha256)
            actual = hl.sha256(data).hexdigest()
            async with async_session() as db:
                fp = (await db.execute(
                    select(Fingerprint).where(Fingerprint.sha256 == sha256)
                )).scalar_one_or_none()
                if fp:
                    fp.verified = (actual == sha256)
                    await db.commit()
                    if fp.verified:
                        _log.info(f"SHA256 验证通过: {sha256[:16]}...")
                    else:
                        _log.error(f"SHA256 验证失败: expected={sha256[:16]}..., actual={actual[:16]}...")
        except Exception as e:
            _log.error(f"SHA256 异步验证异常: {e}")

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
