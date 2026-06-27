"""文件存储服务 — SHA256 去重 + 元数据记录"""
from __future__ import annotations
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileMeta import FileMeta
from app.infrastructure.storage.MinioClient import client as minio


class StorageService:
    """文件存储：去重上传 + 元数据记录 + 下载链接生成"""

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
    async def create_meta(
        db: AsyncSession,
        fingerprint_id: int,
        filename: str,
    ) -> FileMeta:
        """从 fingerprint_id 创建 FileMeta。调用方必须传入真实文件名。"""
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise ValueError(f"指纹不存在: {fingerprint_id}")
        record = FileMeta(
            fingerprint_id=fp.id,
            filename=filename,
            size=fp.size,
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
