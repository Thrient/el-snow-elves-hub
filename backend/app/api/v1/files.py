"""文件预检 — 秒传支持"""
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db, async_session
from app.models.file import File

router = APIRouter(prefix="/files", tags=["文件"])


class CheckRequest(BaseModel):
    md5: str
    filename: str = ""
    size: int | None = None


@router.post("/check")
async def check_file(body: CheckRequest):
    """预检：MD5 已存在则返回 file_id，实现秒传"""
    async with async_session() as db:
        existing = (await db.execute(select(File).where(File.md5 == body.md5))).scalar_one_or_none()
        if existing:
            return {"code": 0, "data": {"exists": True, "file_id": existing.id}}
        return {"code": 0, "data": {"exists": False, "file_id": None}}
