"""用户中心 API — 我的下载 / 我的点赞 / 头像上传"""
import uuid
from fastapi import APIRouter, Depends, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.task import DownloadRecord, Task, TaskLike
from app.models.user import User
from app.utils.file_service import store, file_url

router = APIRouter(prefix="/users", tags=["用户"])


class DownloadItem(BaseModel):
    task_id: int
    task_title: str = ""
    downloaded_at: datetime

    model_config = {"from_attributes": True}


class LikeItem(BaseModel):
    task_id: int
    task_title: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/me/downloads")
async def my_downloads(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DownloadRecord).where(DownloadRecord.user_id == user.id).order_by(desc(DownloadRecord.downloaded_at)).limit(50)
    )
    items = []
    for r in result.scalars().all():
        task = (await db.execute(select(Task).where(Task.id == r.task_id))).scalar_one_or_none()
        items.append(DownloadItem(task_id=r.task_id, task_title=task.title if task else "", downloaded_at=r.downloaded_at))
    return {"code": 0, "message": "ok", "data": items}


@router.get("/me/likes")
async def my_likes(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskLike).where(TaskLike.user_id == user.id).order_by(desc(TaskLike.created_at)).limit(50)
    )
    items = []
    for r in result.scalars().all():
        task = (await db.execute(select(Task).where(Task.id == r.task_id))).scalar_one_or_none()
        items.append(LikeItem(task_id=r.task_id, task_title=task.title if task else "", created_at=r.created_at))
    return {"code": 0, "message": "ok", "data": items}


@router.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not file.content_type or not file.content_type.startswith("image/"):
        return {"code": -1, "message": "仅支持图片格式"}
    data = await file.read()
    fp = await store(db, data, file.filename or "avatar.png", file.content_type)
    user.avatar_id = fp.id
    await db.commit()
    return {"code": 0, "message": "ok", "data": {"avatar_url": file_url(fp)}}
