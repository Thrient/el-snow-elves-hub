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
    fp_ids = list(fp_map.values())
    # 找已有 FileRecord
    rec_map: dict[int, int] = {}
    if fp_ids:
        from app.infrastructure.storage.entity.FileRecord import FileRecord
        rec_rows = (await db.execute(
            select(FileRecord.fingerprint_id, FileRecord.id).where(FileRecord.fingerprint_id.in_(fp_ids))
        )).all()
        rec_map = {row[0]: row[1] for row in rec_rows}
    if isinstance(body.sha256, str):
        fp_id = fp_map.get(body.sha256)
        rec_id = rec_map.get(fp_id) if fp_id else None
        return ok({"exists": fp_id is not None, "record_id": rec_id})
    existing_hashes = [h for h in hashes if h in fp_map]
    return ok({
        "existing": existing_hashes,
        "missing": [h for h in hashes if h not in fp_map],
    })
