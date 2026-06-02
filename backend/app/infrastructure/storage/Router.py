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
    hashes = body.get_list()
    if not hashes:
        return ok({"existing": [], "missing": []})
    rows = (await db.execute(
        select(Fingerprint.sha256, Fingerprint.id).where(Fingerprint.sha256.in_(hashes))
    )).all()
    fp_map = {row[0]: row[1] for row in rows}
    if isinstance(body.sha256, str):
        fp_id = fp_map.get(body.sha256)
        return ok({"exists": fp_id is not None, "fingerprint_id": fp_id})
    existing = [
        {"sha256": h, "fingerprint_id": fp_map[h]}
        for h in hashes if h in fp_map
    ]
    return ok({
        "existing": existing,
        "missing": [h for h in hashes if h not in fp_map],
    })
