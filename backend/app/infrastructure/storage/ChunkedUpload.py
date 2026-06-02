"""无状态分片上传 — SHA256 天然标识 + Redis 分布式锁"""
import asyncio
import hashlib
import logging
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.UploadChunk import UploadChunk
from app.infrastructure.storage.Lock import lock_chunk, release_chunk, lock_merge, release_merge
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.FileValidator import detect_type

_log = logging.getLogger("Elves.ChunkedUpload")


def _minio():
    """Lazy import MinioClient singleton — avoids import-time connection errors."""
    from app.infrastructure.storage.MinioClient import client
    return client


class ChunkedUpload:

    # ── init: 纯查询，不创建任何记录 ──

    async def init(self, db: AsyncSession, *, sha256: str,
                   total_chunks: int, filename: str) -> dict:
        result = await db.execute(
            select(UploadChunk.chunk_index)
            .where(UploadChunk.sha256 == sha256)
            .order_by(UploadChunk.chunk_index)
        )
        chunks = sorted(row[0] for row in result.all())
        return {
            "exists": len(chunks) > 0,
            "chunks": chunks,
            "total_chunks": total_chunks,
        }

    # ── chunk: Redis 锁 → 双重检查 → MinIO → DB ──

    async def chunk(self, db: AsyncSession, r, *, sha256: str, n: int,
                    total_chunks: int, filename: str, data: bytes) -> dict:
        if not await lock_chunk(r, sha256, n):
            await asyncio.sleep(0.1)
            existing = await db.execute(
                select(UploadChunk).where(
                    UploadChunk.sha256 == sha256, UploadChunk.chunk_index == n,
                )
            )
            if existing.scalar_one_or_none():
                return {"chunk": n, "status": "exists"}
            await asyncio.sleep(0.5)
            if not await lock_chunk(r, sha256, n):
                return {"chunk": n, "status": "conflict"}

        try:
            existing = await db.execute(
                select(UploadChunk).where(
                    UploadChunk.sha256 == sha256, UploadChunk.chunk_index == n,
                )
            )
            if existing.scalar_one_or_none():
                return {"chunk": n, "status": "exists"}

            _minio().upload(f"chunks/{sha256}/{n}", data, "application/octet-stream")
            db.add(UploadChunk(
                sha256=sha256, chunk_index=n,
                total_chunks=total_chunks, filename=filename,
            ))
            await db.commit()
            return {"chunk": n, "status": "ok"}
        finally:
            await release_chunk(r, sha256, n)

    # ── complete: 流式算哈希 → 快路径 → Redis 合并锁 → 组装 → 只建 Fingerprint ──

    async def complete(self, db: AsyncSession, r, *, sha256: str,
                       total_chunks: int) -> dict:
        # 1. 完整性检查
        count_result = await db.execute(
            select(func.count()).where(UploadChunk.sha256 == sha256)
        )
        if count_result.scalar() != total_chunks:
            raise ValueError(f"分片未完整")

        # 2. 流式读取所有分片 → 哈希 + 大小（一趟循环）
        h = hashlib.sha256()
        first_chunk_data = None
        total_size = 0
        minio = _minio()
        for n in range(total_chunks):
            data, _ = minio.download(f"chunks/{sha256}/{n}")
            h.update(data)
            total_size += len(data)
            if n == 0:
                first_chunk_data = data
        full_hash = h.hexdigest()

        # 3. 快路径：指纹已存在
        fp_result = await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == full_hash)
        )
        fp = fp_result.scalar_one_or_none()
        if fp:
            return {"fingerprint_id": fp.id}

        # 4. 抢合并锁
        if not await lock_merge(r, sha256):
            for _ in range(30):
                await asyncio.sleep(1)
                fp = (await db.execute(
                    select(Fingerprint).where(Fingerprint.sha256 == full_hash)
                )).scalar_one_or_none()
                if fp:
                    return {"fingerprint_id": fp.id}
            if not await lock_merge(r, sha256):
                raise ValueError("合并锁超时")

        try:
            # 5. 双重检查
            fp = (await db.execute(
                select(Fingerprint).where(Fingerprint.sha256 == full_hash)
            )).scalar_one_or_none()
            if fp:
                return {"fingerprint_id": fp.id}

            # 6. MinIO multipart copy 组装（异常时 abort 防止对象存储泄露）
            mp_id = None
            try:
                mp_id = minio.create_multipart_upload(full_hash)
                parts = []
                for i in range(total_chunks):
                    result = minio.upload_part_copy(
                        full_hash, mp_id, i + 1, f"chunks/{sha256}/{i}"
                    )
                    parts.append(result)
                minio.complete_multipart_upload(full_hash, mp_id, parts)
            except Exception:
                if mp_id:
                    try:
                        minio.abort_multipart_upload(full_hash, mp_id)
                    except Exception:
                        _log.warning(f"abort multipart upload 失败: {full_hash}")
                raise

            # 7. 创建 Fingerprint（只建指纹，不建 FileRecord）
            detected = detect_type(first_chunk_data)
            fp = Fingerprint(
                sha256=full_hash, size=total_size, detected_type=detected,
            )
            db.add(fp)
            await db.flush()

            # 8. 清理
            chunk_keys = [f"chunks/{sha256}/{n}" for n in range(total_chunks)]
            try:
                minio.delete_objects(chunk_keys)
            except Exception:
                _log.warning(f"分片清理失败: chunks/{sha256}/*")
            await db.execute(delete(UploadChunk).where(UploadChunk.sha256 == sha256))
            await db.commit()

            return {"fingerprint_id": fp.id}
        finally:
            await release_merge(r, sha256)

    # ── direct: 小文件直传（只建指纹，不建 FileRecord） ──

    async def direct_upload(self, db: AsyncSession, r, *,
                            filename: str, data: bytes) -> dict:
        sha256 = hashlib.sha256(data).hexdigest()

        # 快路径
        existing = await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == sha256)
        )
        fp = existing.scalar_one_or_none()
        if fp:
            return {"fingerprint_id": fp.id}

        # 抢锁
        if not await lock_merge(r, sha256):
            for _ in range(10):
                await asyncio.sleep(0.5)
                fp = (await db.execute(
                    select(Fingerprint).where(Fingerprint.sha256 == sha256)
                )).scalar_one_or_none()
                if fp:
                    return {"fingerprint_id": fp.id}
            if not await lock_merge(r, sha256):
                raise ValueError("直传锁超时")

        try:
            fp = (await db.execute(
                select(Fingerprint).where(Fingerprint.sha256 == sha256)
            )).scalar_one_or_none()
            if fp:
                return {"fingerprint_id": fp.id}

            minio = _minio()
            detected = detect_type(data)
            minio.upload(sha256, data, "application/octet-stream")
            fp = Fingerprint(sha256=sha256, size=len(data), detected_type=detected)
            db.add(fp)
            await db.commit()
            return {"fingerprint_id": fp.id}
        finally:
            await release_merge(r, sha256)


chunked_upload = ChunkedUpload()
