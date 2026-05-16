"""文件服务 — 上传到 MinIO + 中间表记录 + MD5 去重"""
import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.utils.minio import upload_file, get_file_url


async def upload(
    db: AsyncSession,
    data: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
    uploader_id: int | None = None,
) -> File:
    """上传文件到 MinIO，写入中间表。同 MD5 文件不重复上传"""
    md5 = hashlib.md5(data).hexdigest()

    # 去重：相同 MD5 直接复用
    existing = (await db.execute(select(File).where(File.md5 == md5))).scalar_one_or_none()
    if existing:
        return existing

    ext = filename.split(".")[-1] if "." in filename else "bin"
    key = f"files/{uuid.uuid4().hex}.{ext}"
    upload_file(key, data, content_type)

    f = File(
        key=key,
        original_name=filename,
        content_type=content_type,
        size=len(data),
        md5=md5,
        uploader_id=uploader_id,
    )
    db.add(f)
    await db.flush()
    return f


def file_url(file: File | None) -> str | None:
    """从 File 记录获取预签名 URL"""
    if not file:
        return None
    return get_file_url(file.key)
