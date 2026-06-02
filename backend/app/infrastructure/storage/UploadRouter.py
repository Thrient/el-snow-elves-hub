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
    # Backend computes hash: read sha256 from the upload session
    upload = (await db.execute(
        select(Upload).where(Upload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise HTTPException(400, "上传会话不存在或已过期")
    if not upload.sha256:
        raise HTTPException(400, "上传会话缺少 sha256，请重新初始化上传")
    try:
        fp, record = await chunked_upload.complete(db, upload_id, upload.sha256)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"record_id": record.id})
