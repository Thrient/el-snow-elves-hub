"""Blobs API — 通过指纹 ID 下载 MinIO 存储的文件对象"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.database import async_session
from app.models.fingerprint import Fingerprint
from app.utils.minio import stream_file

router = APIRouter(prefix="/blobs", tags=["文件下载"])


@router.get("/{fingerprint_id}")
async def download_blob(fingerprint_id: int):
    """通过指纹 ID 下载文件。匿名访问（RBAC 控制）。"""
    async with async_session() as db:
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(404, "文件不存在")

        gen, ct, length = stream_file(fp.sha256)

        headers = {}
        if length:
            headers["Content-Length"] = str(length)

        return StreamingResponse(gen, media_type=ct, headers=headers)
