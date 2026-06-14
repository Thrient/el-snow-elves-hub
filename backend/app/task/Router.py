"""任务市场 — 列表/详情/下载/点赞/评论/创建"""
from __future__ import annotations
import math
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, get_data_scope, require_owner, get_optional_user, require_perm_any, require_verified
from app.infrastructure.Response import ok, fail
from app.task.entity.Task import Task
from app.task.entity.TaskVersion import TaskVersion
from app.task.entity.Comment import Comment as CommentModel
from app.task.entity.TaskLike import TaskLike
from app.task.entity.DownloadRecord import DownloadRecord
from app.task.entity.TaskView import TaskView
from app.task.Schema.TaskOut import TaskOut, TaskVersionOut
from app.task.Schema.CommentOut import CommentOut
from app.task.Schema.CommentCreate import CommentCreate
from app.identity.entity.User import User
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.MinioClient import client as minio
from app.infrastructure.EventBus import publish_review

router = APIRouter(prefix="/tasks", tags=["任务市场"])


async def _to_task(t: Task, current_user_id: int | None, db: AsyncSession) -> TaskOut:
    author = (await db.execute(select(User).where(User.id == t.author_id))).scalar_one_or_none()
    liked = False
    if current_user_id:
        like = (await db.execute(
            select(TaskLike).where(and_(TaskLike.task_id == t.id, TaskLike.user_id == current_user_id))
        )).scalar_one_or_none()
        liked = like is not None
    latest_version = t.versions[0] if t.versions else None
    versions_out = []
    for tv in t.versions:
        versions_out.append(TaskVersionOut(
            id=tv.id,
            version=tv.version,
            file_name=tv.file_record.filename if tv.file_record else None,
            file_size=tv.file_record.size if tv.file_record else None,
            changelog=tv.changelog,
            created_at=tv.created_at,
        ))
    return TaskOut(
        id=t.id, title=t.title, description=t.description,
        author_id=t.author_id, author_name=author.username if author else "",
        author_avatar_url=author.avatar_url if author else None,
        category=t.category, tags=t.tags, version=t.current_version,
        file_size=latest_version.file_record.size if latest_version and latest_version.file_record else None,
        cover_url=f"/api/v1/files/{t.cover_record.fingerprint.sha256}" if t.cover_record else None,
        status=t.status, view_count=t.view_count,
        download_count=t.download_count, like_count=t.like_count,
        comment_count=t.comment_count,
        liked=liked, created_at=t.created_at,
        versions=versions_out,
    )


def _get_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _has_recent(records, user_id: int | None, ip: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    for r in records:
        ts = None
        for attr in ("viewed_at", "downloaded_at", "created_at"):
            ts = getattr(r, attr, None)
            if ts:
                break
        if ts and ts < cutoff:
            continue
        if user_id and r.user_id == user_id:
            return True
        if r.ip_address and ip and r.ip_address == ip:
            return True
    return False


# ── List ──

@router.get("")
async def list_tasks(
    page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=50),
    search: str = Query(""), category: str = Query(""), sort: str = Query("latest"),
    status: str = Query(""),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("task:list")),
):
    scope = await get_data_scope(user)
    if scope == "all":
        q = select(Task)
        if status:
            q = q.where(Task.status == status)
    else:
        q = select(Task).where(Task.status == "published")
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


# ── Rankings ──

@router.get("/rankings/list")
async def rankings(
    period: str = Query("all"), db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:rankings")),
):
    q = select(Task).where(Task.status == "published")
    if period == "week":
        q = q.where(Task.created_at >= func.now() - 7 * 86400)
    elif period == "month":
        q = q.where(Task.created_at >= func.now() - 30 * 86400)
    result = await db.execute(q.order_by(desc(Task.download_count)).limit(20))
    tasks = [await _to_task(t, None, db) for t in result.scalars().all()]
    return ok(tasks)


# ── User's tasks ──

@router.get("/user/{user_id}")
async def list_user_tasks(
    user_id: int, db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("task:user")),
):
    result = await db.execute(
        select(Task).where(and_(Task.author_id == user_id, Task.status == "published"))
        .order_by(desc(Task.created_at))
    )
    tasks = [await _to_task(t, user.id if user else None, db) for t in result.scalars().all()]
    return ok(tasks)


# ── Detail ──

@router.get("/{task_id}")
async def get_task(
    task_id: int, db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    request: Request = None,
    _=Depends(require_perm_any("task:view")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
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
async def download_task(
    task_id: int, db: AsyncSession = Depends(get_db),
    version: str | None = Query(None),
    user: User | None = Depends(get_optional_user),
    request: Request = None,
    _=Depends(require_perm_any("task:download")),
):
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

    # Find the requested TaskVersion (or latest)
    if version:
        tv = (await db.execute(
            select(TaskVersion).where(
                and_(TaskVersion.task_id == task_id, TaskVersion.version == version)
            )
        )).scalar_one_or_none()
    else:
        tv = (await db.execute(
            select(TaskVersion).where(TaskVersion.task_id == task_id)
            .order_by(TaskVersion.created_at.desc())
        )).scalars().first()

    if not tv or not tv.file_record or not tv.file_record.fingerprint:
        raise HTTPException(404, "任务文件不存在")

    author = (await db.execute(select(User).where(User.id == t.author_id))).scalar_one_or_none()
    gen, ct, length = minio.stream(tv.file_record.fingerprint.sha256)
    download_name = f"{t.title}_{tv.version}_{author.username if author else 'unknown'}.zip"
    encoded = quote(download_name)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    if length:
        headers["Content-Length"] = str(length)
    return StreamingResponse(gen, media_type=ct, headers=headers)


# ── Delete ──

@router.delete("/{task_id}")
async def delete_task(
    task_id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:delete")), _v=Depends(require_verified),
):
    task = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not task:
        raise HTTPException(404, "任务不存在")

    await require_owner(task, user)
    await db.delete(task)
    await db.commit()
    return ok({})


# ── Like ──

@router.post("/{task_id}/like")
async def toggle_like(
    task_id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:like")),
    _v=Depends(require_verified),
):
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
async def list_comments(
    task_id: int, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:comments")),
):
    result = await db.execute(
        select(CommentModel).where(CommentModel.task_id == task_id).order_by(CommentModel.created_at)
    )
    comment_list = list(result.scalars().all())
    user_ids = {c.user_id for c in comment_list}
    users = {}
    if user_ids:
        rows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        users = {u.id: u for u in rows}
    comments = [
        CommentOut(
            id=c.id, task_id=c.task_id, user_id=c.user_id,
            user_name=users.get(c.user_id, User()).username,
            user_avatar_url=users.get(c.user_id, User()).avatar_url,
            content=c.content, parent_id=c.parent_id, created_at=c.created_at,
        )
        for c in comment_list
    ]
    return ok(comments)


@router.post("/{task_id}/comments", status_code=201)
async def create_comment(
    task_id: int, body: CommentCreate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:comment")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    c = CommentModel(task_id=task_id, user_id=user.id, content=body.content, parent_id=body.parent_id)
    db.add(c)
    t.comment_count += 1
    await db.commit()
    try:
        await publish_review("comment", c.id)
    except Exception as e:
        print(f"Failed to enqueue review for comment #{c.id}: {e}")
    return ok({"id": c.id})


@router.delete("/{task_id}/comments/{comment_id}")
async def delete_comment(
    task_id: int, comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("comment:delete")),
):
    c = (await db.execute(select(CommentModel).where(
        CommentModel.id == comment_id, CommentModel.task_id == task_id
    ))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "评论不存在")
    if c.user_id != user.id:
        raise HTTPException(403, "只能删除自己的评论")
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one()
    await db.delete(c)
    t.comment_count = max(0, t.comment_count - 1)
    await db.commit()
    return ok({})


# ── Create ──

@router.post("", status_code=201)
async def create_task(
    request: Request,
    title: str = Form(...), description: str = Form(""),
    category: str = Form("综合"), tags: str = Form(""),
    version: str = Form("1.0"), filename: str = Form(""),
    zip_fingerprint_id: int = Form(..., alias="zip_fingerprint_id"),
    cover_fingerprint_id: int | None = Form(None, alias="cover_fingerprint_id"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:create")),
):
    if "multipart/form-data" not in (request.headers.get("content-type") or ""):
        raise HTTPException(415, "请使用 multipart/form-data 上传")

    # Validate ZIP fingerprint
    fp = (await db.execute(
        select(Fingerprint).where(Fingerprint.id == zip_fingerprint_id)
    )).scalar_one_or_none()
    if not fp or fp.detected_type != "zip":
        raise HTTPException(400, "ZIP 文件指纹无效或类型不匹配")

    file_record = await storage_service.create_record_from_fingerprint(
        db, zip_fingerprint_id, filename, user.id,
    )

    cover_record = None
    if cover_fingerprint_id:
        cfp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == cover_fingerprint_id)
        )).scalar_one_or_none()
        if not cfp or cfp.detected_type not in ("png", "jpeg", "gif"):
            raise HTTPException(400, "封面仅支持 PNG / JPEG / GIF 图片")
        cover_record = await storage_service.create_record_from_fingerprint(
            db, cover_fingerprint_id, filename or "cover", user.id,
        )

    task = Task(
        title=title, description=description, author_id=user.id,
        category=category, tags=tags, version=version,
        current_version=version,
        cover_record_id=cover_record.id if cover_record else None,
        status="published",
    )
    db.add(task)
    await db.flush()

    tv = TaskVersion(
        task_id=task.id,
        version=version,
        file_record_id=file_record.id,
    )
    db.add(tv)
    await db.commit()
    await db.refresh(task)
    try:
        await publish_review("task", task.id)
    except Exception as e:
        print(f"Failed to enqueue review for task #{task.id}: {e}")
    return ok(await _to_task(task, user.id, db))


# ── Edit ──

@router.put("/{task_id}")
async def update_task(
    task_id: int,
    description: str | None = Form(None),
    category: str | None = Form(None),
    tags: str | None = Form(None),
    cover_fingerprint_id: int | None = Form(None, alias="cover_fingerprint_id"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:create")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.author_id != user.id:
        raise HTTPException(403, "只能编辑自己的任务")
    if description is not None:
        t.description = description
    if category is not None:
        t.category = category
    if tags is not None:
        t.tags = tags
    if cover_fingerprint_id is not None:
        cfp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == cover_fingerprint_id)
        )).scalar_one_or_none()
        if not cfp or cfp.detected_type not in ("png", "jpeg", "gif"):
            raise HTTPException(400, "封面仅支持 PNG / JPEG / GIF 图片")
        cover_record = await storage_service.create_record_from_fingerprint(
            db, cover_fingerprint_id, "cover", user.id,
        )
        t.cover_record_id = cover_record.id
    await db.commit()
    await db.refresh(t)
    return ok(await _to_task(t, user.id, db))


# ── New Version ──

@router.post("/{task_id}/versions", status_code=201)
async def create_task_version(
    task_id: int,
    version: str = Form(...),
    changelog: str = Form(""),
    filename: str = Form(""),
    zip_fingerprint_id: int = Form(..., alias="zip_fingerprint_id"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:create")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.author_id != user.id:
        raise HTTPException(403, "只能为自己的任务上传新版本")

    # Check duplicate version
    existing = (await db.execute(
        select(TaskVersion).where(
            and_(TaskVersion.task_id == task_id, TaskVersion.version == version)
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"版本 {version} 已存在")

    # Validate ZIP fingerprint
    fp = (await db.execute(
        select(Fingerprint).where(Fingerprint.id == zip_fingerprint_id)
    )).scalar_one_or_none()
    if not fp or fp.detected_type != "zip":
        raise HTTPException(400, "ZIP 文件指纹无效或类型不匹配")

    file_record = await storage_service.create_record_from_fingerprint(
        db, zip_fingerprint_id, filename, user.id,
    )

    tv = TaskVersion(
        task_id=task_id,
        version=version,
        changelog=changelog,
        file_record_id=file_record.id,
    )
    db.add(tv)
    t.current_version = version
    t.version = version
    await db.commit()
    await db.refresh(t)
    return ok(await _to_task(t, user.id, db))


# ── Replace Version File ──

@router.put("/{task_id}/versions/{version_id}")
async def replace_version_file(
    task_id: int, version_id: int,
    zip_fingerprint_id: int = Form(..., alias="zip_fingerprint_id"),
    filename: str = Form(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:create")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.author_id != user.id:
        raise HTTPException(403, "只能修改自己的任务版本")

    tv = (await db.execute(
        select(TaskVersion).where(and_(TaskVersion.id == version_id, TaskVersion.task_id == task_id))
    )).scalar_one_or_none()
    if not tv:
        raise HTTPException(404, "版本不存在")

    fp = (await db.execute(
        select(Fingerprint).where(Fingerprint.id == zip_fingerprint_id)
    )).scalar_one_or_none()
    if not fp or fp.detected_type != "zip":
        raise HTTPException(400, "ZIP 文件指纹无效或类型不匹配")

    file_record = await storage_service.create_record_from_fingerprint(
        db, zip_fingerprint_id, filename, user.id,
    )
    tv.file_record_id = file_record.id
    await db.commit()
    return ok({"version_id": tv.id, "file_size": file_record.size})


# ── Delete Version ──

@router.delete("/{task_id}/versions/{version_id}")
async def delete_task_version(
    task_id: int, version_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("task:delete")),
):
    t = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.author_id != user.id:
        raise HTTPException(403, "只能删除自己的任务版本")

    tv = (await db.execute(
        select(TaskVersion).where(
            and_(TaskVersion.id == version_id, TaskVersion.task_id == task_id)
        )
    )).scalar_one_or_none()
    if not tv:
        raise HTTPException(404, "版本不存在")

    # Count remaining versions
    version_count = (await db.execute(
        select(func.count()).select_from(TaskVersion).where(TaskVersion.task_id == task_id)
    )).scalar() or 0
    if version_count <= 1:
        raise HTTPException(400, "不能删除最后一个版本")

    await db.delete(tv)
    await db.commit()
    return ok({})
