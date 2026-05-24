from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_perm_any
from app.core.response import ok
from app.models.fingerprint import Fingerprint
from app.models.user import User

router = APIRouter(prefix="/files", tags=["文件"])


class CheckRequest(BaseModel):
    sha256: str


@router.post("/check")
async def check_file(body: CheckRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), _=Depends(require_perm_any("file:check"))):
    fp = (await db.execute(select(Fingerprint).where(Fingerprint.sha256 == body.sha256))).scalar_one_or_none()
    if fp:
        return ok({"exists": True, "fingerprint_id": fp.id})
    return ok({"exists": False, "fingerprint_id": None})
