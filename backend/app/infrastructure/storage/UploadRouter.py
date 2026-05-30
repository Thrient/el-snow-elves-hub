"""分块上传 — REST 端点"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any
from app.infrastructure.Response import ok
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.StorageService import storage_service
from app.identity.entity.User import User

router = APIRouter(prefix="/uploads", tags=["断点续传"])

from app.infrastructure.storage.Schema.InitRequest import InitRequest


@router.post("/init")
async def init_upload(
    body: InitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload")),
):
    upload = await chunked_upload.init(db, body.filename, body.total_size, body.total_chunks, user.id)
    return ok({"upload_id": upload.upload_id, "expires_at": upload.expires_at.isoformat()})


@router.post("/{upload_id}/chunk")
async def upload_chunk(
    upload_id: str,
    n: int = Query(...),
    chunk: UploadFile = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload")),
):
    if not chunk:
        raise HTTPException(400, "缺少分片数据")
    upload = await chunked_upload.chunk(db, upload_id, n, await chunk.read())
    return ok({"chunk": n, "uploaded": len(upload.uploaded_chunks or []), "total": upload.total_chunks})


@router.post("/{upload_id}/complete")
async def complete_upload(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload")),
):
    try:
        fp = await chunked_upload.complete(db, upload_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"fingerprint_id": fp.id, "url": storage_service.url(fp)})
