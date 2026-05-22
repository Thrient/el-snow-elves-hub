"""指纹服务 — SHA256 去重 + MinIO 对象存储"""
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fingerprint import Fingerprint
from app.utils.minio import upload_file as minio_upload


async def ensure_fingerprint(db: AsyncSession, data: bytes) -> Fingerprint:
    """计算 SHA256，检查是否已存在；新指纹上传到 MinIO 后返回。"""
    sha256 = hashlib.sha256(data).hexdigest()

    existing = (await db.execute(
        select(Fingerprint).where(Fingerprint.sha256 == sha256)
    )).scalar_one_or_none()
    if existing:
        return existing

    fp = Fingerprint(sha256=sha256, size=len(data))
    db.add(fp)
    await db.flush()

    # MinIO key = integer fingerprint ID as string
    minio_upload(str(fp.id), data, "application/octet-stream")
    return fp
