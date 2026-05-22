"""文件服务 — SHA256 去重 + MinIO 内容寻址存储"""
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fingerprint import Fingerprint
from app.utils.minio import upload_file, get_file_url


async def store(db: AsyncSession, data: bytes, filename: str = "file.bin",
                content_type: str = "application/octet-stream",
                uploader_id: int | None = None) -> Fingerprint:
    """SHA256 去重上传。MinIO key = SHA256 十六进制串。"""
    sha256 = hashlib.sha256(data).hexdigest()

    existing = (await db.execute(
        select(Fingerprint).where(Fingerprint.sha256 == sha256)
    )).scalar_one_or_none()
    if existing:
        return existing

    upload_file(sha256, data, content_type)
    fp = Fingerprint(sha256=sha256, size=len(data))
    db.add(fp)
    await db.flush()
    return fp


def file_url(fp: Fingerprint | None) -> str | None:
    """从 Fingerprint 记录获取预签名 URL。MinIO key = sha256。"""
    if not fp:
        return None
    return get_file_url(fp.sha256)


# backward-compat alias
upload = store
