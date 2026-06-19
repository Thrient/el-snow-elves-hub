"""无状态上传 — REST 端点"""
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.Config import settings
from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any, require_verified
from app.infrastructure.Response import ok
from app.infrastructure.Limiter import get_limiter
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.identity.entity.User import User
from app.audit.service import log_audit

router = APIRouter(prefix="/uploads", tags=["文件上传"])
_limiter = get_limiter()

from app.infrastructure.storage.Schema.InitRequest import InitRequest
from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest


@router.post("/init")
@_limiter.limit("512/minute")
async def init_upload(
    request: Request, body: InitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:init")),
    _v=Depends(require_verified),
):
    status = await chunked_upload.init(
        db, sha256=body.sha256,
        total_chunks=body.total_chunks, filename=body.filename,
    )
    return ok(status)


@router.post("/chunk")
@_limiter.limit("10000/minute")
async def upload_chunk(
    request: Request,
    sha256: str = Query(...),
    n: int = Query(...),
    total: int = Query(...),
    filename: str = Query(...),
    chunk: UploadFile = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:chunk")),
    _v=Depends(require_verified),
):
    if not chunk:
        raise HTTPException(400, "缺少分片数据")
    r = aioredis.from_url(settings.redis_url, decode_responses=False)
    try:
        result = await chunked_upload.chunk(
            db, r, sha256=sha256, n=n,
            total_chunks=total, filename=filename,
            data=await chunk.read(),
        )
    finally:
        await r.aclose()
    return ok(result)


@router.post("/complete")
@_limiter.limit("512/minute")
async def complete_upload(
    request: Request, body: CompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:complete")),
    _v=Depends(require_verified),
):
    r = aioredis.from_url(settings.redis_url, decode_responses=False)
    try:
        result = await chunked_upload.complete(
            db, r, sha256=body.sha256, total_chunks=body.total_chunks,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    finally:
        await r.aclose()
    fp_id = result["fingerprint_id"]
    await log_audit(user, "upload", "file", fp_id, "chunked upload", "")
    return ok({"fingerprint_id": fp_id})


@router.post("/direct")
@_limiter.limit("512/minute")
async def direct_upload(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:direct")),
    _v=Depends(require_verified),
):
    r = aioredis.from_url(settings.redis_url, decode_responses=False)
    try:
        result = await chunked_upload.direct_upload(
            db, r, filename=file.filename or "untitled",
            data=await file.read(),
        )
    finally:
        await r.aclose()
    fp_id = result["fingerprint_id"]
    await log_audit(user, "upload", "file", fp_id, "direct: " + (file.filename or "untitled"), "")
    return ok({"fingerprint_id": fp_id})
