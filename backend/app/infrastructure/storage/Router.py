"""文件存储 — 秒传预检"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any
from app.infrastructure.Response import ok
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.identity.entity.User import User

router = APIRouter(prefix="/files", tags=["文件"])

from app.infrastructure.storage.Schema.CheckRequest import CheckRequest


@router.post("/check")
async def check_file(
    body: CheckRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:check")),
):
    fp = (await db.execute(
        select(Fingerprint).where(Fingerprint.sha256 == body.sha256)
    )).scalar_one_or_none()
    if fp:
        return ok({"exists": True, "fingerprint_id": fp.id})
    return ok({"exists": False, "fingerprint_id": None})
