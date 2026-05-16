"""断点续传 — 分片上传 API"""
import io, hashlib
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.upload import Upload
from app.models.user import User
from app.utils.minio import upload_file as minio_upload, download_file as minio_download
from app.utils.file_service import upload as file_upload, file_url

router = APIRouter(prefix="/uploads", tags=["断点续传"])


class InitRequest(BaseModel):
    filename: str
    total_size: int
    total_chunks: int
    md5: str | None = None


@router.post("/init")
async def init_upload(body: InitRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    upload = Upload(filename=body.filename, total_size=body.total_size, total_chunks=body.total_chunks, md5=body.md5)
    db.add(upload)
    await db.commit()
    return {"code": 0, "data": {"upload_id": upload.upload_id, "expires_at": upload.expires_at.isoformat()}}


@router.post("/{upload_id}/chunk")
async def upload_chunk(upload_id: str, n: int = Query(...), request: Request = None,
                       user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upload).where(Upload.upload_id == upload_id))
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(404, "上传会话不存在或已过期")

    data = await request.body()
    minio_upload(f"chunks/{upload_id}/{n}", data, "application/octet-stream")

    chunks = list(upload.uploaded_chunks or [])
    if n not in chunks:
        chunks.append(n)
    upload.uploaded_chunks = sorted(chunks)
    await db.commit()
    return {"code": 0, "data": {"chunk": n, "uploaded": len(upload.uploaded_chunks), "total": upload.total_chunks}}


@router.post("/{upload_id}/complete")
async def complete_upload(upload_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upload).where(Upload.upload_id == upload_id))
    upload = result.scalar_one_or_none()
    if not upload:
        raise HTTPException(404, "上传会话不存在或已过期")

    chunks = sorted(upload.uploaded_chunks or [])
    if len(chunks) != upload.total_chunks:
        return {"code": -1, "message": f"分片未完整: {len(chunks)}/{upload.total_chunks}"}

    # 组装所有分片
    buf = io.BytesIO()
    for n in chunks:
        data, _ = minio_download(f"chunks/{upload_id}/{n}")
        buf.write(data)

    full_data = buf.getvalue()

    # 计算 MD5 并去重
    f = await file_upload(db, full_data, upload.filename, "application/octet-stream", user.id)

    # 清理分片
    for n in chunks:
        try:
            from app.utils.minio import get_s3
            get_s3().delete_object(Bucket="el-snow-hub", Key=f"chunks/{upload_id}/{n}")
        except Exception:
            pass

    upload.status = "done"
    await db.commit()

    return {"code": 0, "data": {"file_id": f.id, "url": file_url(f)}}
