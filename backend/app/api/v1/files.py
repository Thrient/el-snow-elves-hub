"""文件 API — 预检 / 上传 / 下载"""
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FileParam
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db, async_session
from app.core.deps import get_current_user
from app.models.file import File
from app.models.user import User
from app.utils.file_service import upload, file_url
from app.utils.minio import stream_file

router = APIRouter(prefix="/files", tags=["文件"])


class CheckRequest(BaseModel):
    md5: str
    filename: str = ""
    size: int | None = None


@router.post("/check")
async def check_file(body: CheckRequest):
    async with async_session() as db:
        existing = (await db.execute(select(File).where(File.md5 == body.md5))).scalar_one_or_none()
        if existing:
            return {"code": 0, "data": {"exists": True, "file_id": existing.id}}
        return {"code": 0, "data": {"exists": False, "file_id": None}}


@router.post("/upload")
async def upload_file(
    file: UploadFile = FileParam(...),
    user: User = Depends(get_current_user),
):
    """上传文件到 MinIO，返回 URL / file_id / 大小"""
    if file.content_type and file.content_type.startswith("image/"):
        max_size = 10 * 1024 * 1024
    else:
        max_size = 200 * 1024 * 1024
    if file.size and file.size > max_size:
        raise HTTPException(400, f"文件不能超过 {max_size // 1024 // 1024}MB")

    data = await file.read()
    async with async_session() as db:
        f = await upload(db, data, file.filename or "file.bin", file.content_type or "application/octet-stream", user.id)
        await db.commit()
        return {"code": 0, "data": {"file_id": f.id, "url": file_url(f), "size": f.size}}


@router.get("/{file_id}/download")
async def download_file(file_id: int):
    """通过 ID 流式下载文件（代理 MinIO），支持浏览器进度条"""
    async with async_session() as db:
        f = (await db.execute(select(File).where(File.id == file_id))).scalar_one_or_none()
        if not f:
            raise HTTPException(404, "文件不存在")
        gen, ct, length = stream_file(f.key)
        encoded = quote(f.original_name or "download")
        # RFC 5987 (modern) + traditional fallback for older browsers
        headers = {"Content-Disposition": f"attachment; filename=\"{encoded}\"; filename*=UTF-8''{encoded}"}
        if length:
            headers["Content-Length"] = str(length)
        return StreamingResponse(gen, media_type=ct, headers=headers)
