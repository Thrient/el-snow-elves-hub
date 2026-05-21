"""任务市场 API — 列表/详情/下载/点赞/评论/排行榜"""

import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
import io
from urllib.parse import quote

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.core.response import ok, fail
from app.models.task import Comment as CommentModel, DownloadRecord, Task, TaskLike, TaskView
from app.models.user import User
from app.models.file import File
from app.utils.minio import download_file
from app.utils.file_service import upload, file_url as file_url_from_service

router = APIRouter(prefix="/tasks", tags=["任务市场"])


# ── Schemas ──

class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    author_id: int
    author_name: str = ""
    category: str
    tags: str | None
    version: str
    file_size: int | None
    cover_url: str | None
    status: str
    view_count: int
    download_count: int
    like_count: int
    comment_count: int
    liked: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    user_name: str = ""
    content: str
    parent_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


async def _to_task(t: Task, current_user_id: int | None, db: AsyncSession) -> TaskOut:
    author = (await db.execute(select(User).where(User.id == t.author_id))).scalar_one_or_none()
    liked = False
    if current_user_id:
        like = (await db.execute(
            select(TaskLike).where(and_(TaskLike.task_id == t.id, TaskLike.user_id == current_user_id))
        )).scalar_one_or_none()
        liked = like is not None
    return TaskOut(
        id=t.id, title=t.title, description=t.description,
        author_id=t.author_id, author_name=author.username if author else "",
        category=t.category, tags=t.tags, version=t.version,
        file_size=t.file_size, cover_url=file_url_from_service(t.cover),
        status=t.status, view_count=t.view_count,
        download_count=t.download_count,
        like_count=t.like_count, comment_count=t.comment_count,
        liked=liked, created_at=t.created_at,
    )


# ── List ──

@router.get("")
async def list_tasks(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    search: str = Query(""),
    category: str = Query(""),
    sort: str = Query("latest"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    q = select(Task).where(Task.status == "approved")
    if search:
        q = q.where(Task.title.contains(search))
    if category:
        q = q.where(Task.category == category)

    match sort:
        case "downloads": q = q.order_by(desc(Task.download_count))
        case "likes":     q = q.order_by(desc(Task.like_count))
        case "comments":  q = q.order_by(desc(Task.comment_count))
        case _:           q = q.order_by(desc(Task.created_at))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()
    tasks = [await _to_task(t, user.id if user else None, db) for t in items]

    return ok({"items": tasks, "total": total, "page": page, "pages": math.ceil(total / size)})


# ── Rankings (must be before /{task_id}) ──

@router.get("/rankings/list")
async def rankings(period: str = Query("all"), db: AsyncSession = Depends(get_db)):
    q = select(Task).where(Task.status == "approved")
    if period == "week":
        q = q.where(Task.created_at >= func.now() - 7 * 86400)
    elif period == "month":
        q = q.where(Task.created_at >= func.now() - 30 * 86400)
    result = await db.execute(q.order_by(desc(Task.download_count)).limit(20))
    tasks = [await _to_task(t, None, db) for t in result.scalars().all()]
    return ok(tasks)


# ── User's tasks (must be before /{task_id}) ──

@router.get("/user/{user_id}")
async def list_user_tasks(user_id: int, db: AsyncSession = Depends(get_db), user: User | None = Depends(get_optional_user)):
    result = await db.execute(
        select(Task).where(and_(Task.author_id == user_id, Task.status == "approved")).order_by(desc(Task.created_at))
    )
    tasks = [await _to_task(t, user.id if user else None, db) for t in result.scalars().all()]
    return ok(tasks)


def _get_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _has_recent(records, user_id: int | None, ip: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    for r in records:
        ts = None
        for attr in ("viewed_at", "downloaded_at", "created_at"):
            ts = getattr(r, attr, None)
            if ts: break
        if ts and ts < cutoff:
            continue
        if user_id and r.user_id == user_id:
            return True
        if r.ip_address and ip and r.ip_address == ip:
            return True
    return False


# ── Detail ──

@router.get("/{task_id}")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db), user: User | None = Depends(get_optional_user), request: Request = None):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    # View counting with 24h dedup
    ip = _get_ip(request) if request else ""
    uid = user.id if user else None
    recent_views = (await db.execute(
        select(TaskView).where(
            and_(TaskView.task_id == task_id, TaskView.viewed_at >= datetime.utcnow() - timedelta(hours=24))
        )
    )).scalars().all()
    if not _has_recent(recent_views, uid, ip):
        t.view_count += 1
        db.add(TaskView(task_id=task_id, user_id=uid, ip_address=ip))
        await db.commit()
        await db.refresh(t)
    return ok(await _to_task(t, uid, db))


# ── Download ──

@router.get("/{task_id}/download")
async def download_task(task_id: int, db: AsyncSession = Depends(get_db), user: User | None = Depends(get_optional_user), request: Request = None):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")

    ip = _get_ip(request) if request else ""
    uid = user.id if user else None
    recent = (await db.execute(
        select(DownloadRecord).where(
            and_(DownloadRecord.task_id == task_id, DownloadRecord.downloaded_at >= datetime.utcnow() - timedelta(hours=24))
        )
    )).scalars().all()
    if not _has_recent(recent, uid, ip):
        t.download_count += 1
        db.add(DownloadRecord(task_id=t.id, user_id=uid, ip_address=ip))
        await db.commit()

    if not t.file:
        raise HTTPException(404, "任务文件不存在")
    data, ct = download_file(t.file.key)
    encoded = quote(t.file.original_name)
    return StreamingResponse(io.BytesIO(data), media_type=ct,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"})


# ── Like ──

@router.post("/{task_id}/like")
async def toggle_like(task_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    existing = (await db.execute(
        select(TaskLike).where(and_(TaskLike.task_id == task_id, TaskLike.user_id == user.id))
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        t.like_count = max(0, t.like_count - 1)
        await db.commit()
        return ok({"liked": False, "like_count": t.like_count})
    db.add(TaskLike(task_id=task_id, user_id=user.id))
    t.like_count += 1
    await db.commit()
    return ok({"liked": True, "like_count": t.like_count})


# ── Comments ──

@router.get("/{task_id}/comments")
async def list_comments(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CommentModel).where(CommentModel.task_id == task_id).order_by(CommentModel.created_at)
    )
    comments = []
    for c in result.scalars().all():
        author = (await db.execute(select(User).where(User.id == c.user_id))).scalar_one_or_none()
        comments.append(CommentOut(
            id=c.id, task_id=c.task_id, user_id=c.user_id,
            user_name=author.username if author else "",
            content=c.content, parent_id=c.parent_id, created_at=c.created_at,
        ))
    return ok(comments)


class CommentCreate(BaseModel):
    content: str
    parent_id: int | None = None


@router.post("/{task_id}/comments", status_code=201)
async def create_comment(task_id: int, body: CommentCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    c = CommentModel(task_id=task_id, user_id=user.id, content=body.content, parent_id=body.parent_id)
    db.add(c)
    t.comment_count += 1
    await db.commit()
    return ok({"id": c.id})


@router.delete("/{task_id}/comments/{comment_id}")
async def delete_comment(
    task_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(CommentModel).where(
        CommentModel.id == comment_id, CommentModel.task_id == task_id
    ))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "评论不存在")
    if c.user_id != user.id and not user.has_permission("comment:delete"):
        raise HTTPException(403, "无权删除")
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one()
    await db.delete(c)
    t.comment_count = max(0, t.comment_count - 1)
    await db.commit()
    return ok({})


# ── Upload ──

@router.post("", status_code=201)
async def create_task(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("综合"),
    tags: str = Form(""),
    version: str = Form("1.0"),
    file: UploadFile | None = None,
    zip_file_id: int | None = Form(None),
    cover: UploadFile | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if zip_file_id:
        zip_file = (await db.execute(select(File).where(File.id == zip_file_id))).scalar_one_or_none()
        if not zip_file:
            raise HTTPException(400, "文件不存在")
    elif file and file.filename:
        if not file.filename.endswith(".zip"):
            raise HTTPException(400, "仅支持 ZIP 文件")
        zip_data = await file.read()
        zip_file = await upload(db, zip_data, file.filename or "task.zip", file.content_type or "application/zip", user.id)
    else:
        raise HTTPException(400, "请上传 ZIP 文件")

    cover_file = None
    if cover and cover.filename:
        cover_data = await cover.read()
        cover_file = await upload(db, cover_data, cover.filename, cover.content_type or "image/png", user.id)

    task = Task(
        title=title, description=description, author_id=user.id,
        category=category, tags=tags, version=version,
        file_id=zip_file.id, file_size=zip_file.size or 0,
        cover_id=cover_file.id if cover_file else None, status="approved",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return ok(await _to_task(task, user.id, db))
