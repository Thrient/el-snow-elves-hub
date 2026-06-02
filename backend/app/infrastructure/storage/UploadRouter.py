"""分块上传 — REST 端点"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any, require_verified
from app.infrastructure.Response import ok
from app.infrastructure.Limiter import get_limiter
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.entity.Upload import Upload
from app.identity.entity.User import User

router = APIRouter(prefix="/uploads", tags=["断点续传"])
_limiter = get_limiter()

from app.infrastructure.storage.Schema.InitRequest import InitRequest
from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest


@router.get("/{upload_id}")
async def get_upload_status(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:chunk")),
    _v=Depends(require_verified),
):
    """查询上传会话状态 — 用于断点续传，返回已上传分片列表"""
    upload = (await db.execute(
        select(Upload).where(Upload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise HTTPException(404, "上传会话不存在或已过期")
    return ok({
        "upload_id": upload.upload_id,
        "filename": upload.filename,
        "total_size": upload.total_size,
        "total_chunks": upload.total_chunks,
        "uploaded_chunks": upload.uploaded_chunks or [],
        "chunk_hashes": upload.chunk_hashes or {},
        "status": upload.status,
    })


@router.post("/direct")
@_limiter.limit("60/minute")
async def direct_upload(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:direct")),
    _v=Depends(require_verified),
):
    """小文件直传 — 一次请求完成上传，服务端计算哈希"""
    data = await file.read()
    record = await chunked_upload.direct_upload(db, file.filename or "untitled", data, user.id)
    return ok({"record_id": record.id})


@router.post("/init")
@_limiter.limit("60/minute")
async def init_upload(
    request: Request, body: InitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:init")),
    _v=Depends(require_verified),
):
    upload = await chunked_upload.init(db, body.filename, body.total_size, body.total_chunks, user.id, body.sha256)
    return ok({"upload_id": upload.upload_id, "expires_at": upload.expires_at.isoformat()})


@router.post("/{upload_id}/chunk")
async def upload_chunk(
    request: Request, upload_id: str,
    n: int = Query(...),
    chunk: UploadFile = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:chunk")),
    _v=Depends(require_verified),
):
    if not chunk:
        raise HTTPException(400, "缺少分片数据")
    upload = await chunked_upload.chunk(db, upload_id, n, await chunk.read())
    return ok({"chunk": n, "uploaded": len(upload.uploaded_chunks or []), "total": upload.total_chunks})


@router.post("/{upload_id}/complete")
async def complete_upload(
    request: Request, upload_id: str, body: CompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:complete")),
    _v=Depends(require_verified),
):
    try:
        fp, record = await chunked_upload.complete(db, upload_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"record_id": record.id})
