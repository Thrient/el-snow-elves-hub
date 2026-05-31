"""文件存储服务 — SHA256 去重 + 文件记录"""
from __future__ import annotations
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.storage.MinioClient import client as minio


class StorageService:
    """文件存储：去重上传 + 记录留存 + 下载链接生成"""

    @staticmethod
    async def store(
        db: AsyncSession,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> Fingerprint:
        """SHA256 去重上传。已存在则直接返回，否则写入 MinIO。"""
        sha256 = hashlib.sha256(data).hexdigest()

        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == sha256)
        )).scalar_one_or_none()
        if existing:
            return existing

        minio.upload(sha256, data, content_type)
        fp = Fingerprint(sha256=sha256, size=len(data))
        db.add(fp)
        await db.flush()
        return fp

    @staticmethod
    async def create_record(
        db: AsyncSession,
        fp: Fingerprint,
        filename: str,
        uploaded_by: int | None = None,
    ) -> FileRecord:
        """创建文件上传记录。先调 store() 拿指纹，再调此函数记录上传行为。"""
        record = FileRecord(
            fingerprint_id=fp.id,
            filename=filename,
            size=fp.size,
            uploaded_by=uploaded_by,
        )
        db.add(record)
        await db.flush()
        return record

    @staticmethod
    def url(fp: Fingerprint | None) -> str | None:
        """生成预签名下载链接"""
        if not fp:
            return None
        return minio.get_url(fp.sha256)


storage_service = StorageService()
