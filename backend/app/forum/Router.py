"""论坛 — 板块 / 帖子 / 回复 / 搜索 / 点赞"""
from __future__ import annotations
import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy import select, func, desc, and_, or_, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, get_optional_user, require_perm_any
from app.infrastructure.Response import ok
from app.forum.entity.ForumBoard import ForumBoard
from app.forum.entity.ForumPost import ForumPost
from app.identity.entity.User import User
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.storage.StorageService import storage_service
from app.notification.Router import create_notification
from app.infrastructure.rbac.entity.Permission import Permission
from app.infrastructure.storage.FileValidator import validate_file_size, validate_image

router = APIRouter(prefix="/forum", tags=["论坛"])

_view_dedup: dict[tuple, float] = {}


# ── Schemas ──

from app.forum.Schema.BoardOut import BoardOut
from app.forum.Schema.PostAuthor import PostAuthor
from app.forum.Schema.ThreadOut import ThreadOut
from app.forum.Schema.ThreadListOut import ThreadListOut
from app.forum.Schema.ReplyOut import ReplyOut
from app.forum.Schema.ThreadDetailOut import ThreadDetailOut
from app.forum.Schema.ThreadCreate import ThreadCreate
from app.forum.Schema.ReplyCreate import ReplyCreate
from app.forum.Schema.ThreadUpdate import ThreadUpdate
from app.forum.Schema.AdminAction import AdminAction


def _author_out(u: User | None) -> PostAuthor | None:
    if not u:
        return None
    return PostAuthor(id=u.id, username=u.username, avatar_url=u.avatar_url)


def _thread_out(p: ForumPost) -> ThreadOut:
    return ThreadOut(
        id=p.id, title=p.title, content=p.content,
        author=_author_out(p.author),
        image_urls=[], is_pinned=p.is_pinned, is_locked=p.is_locked,
        view_count=p.view_count, reply_count=p.reply_count,
        last_reply_at=p.last_reply_at.isoformat() if p.last_reply_at else None,
        created_at=p.created_at,
    )


# ── Boards ──

@router.get("/boards")
async def list_boards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ForumBoard).order_by(ForumBoard.sort_order))
    return ok([BoardOut.model_validate(b) for b in result.scalars().all()])


# ── Search ──

@router.get("/search")
async def search_threads(
    q: str = Query(""), page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    query = select(ForumPost).where(and_(ForumPost.parent_id == None, ForumPost.title.contains(q)))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    items = (await db.execute(query.offset((page - 1) * 20).limit(20).order_by(desc(ForumPost.created_at)))).scalars().all()
    return ok({"items": [_thread_out(t) for t in items], "total": total, "page": page, "pages": math.ceil(total / 20)})


# ── Threads ──

@router.get("/boards/{board_id}/threads")
async def list_threads(
    board_id: int, page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    query = select(ForumPost).where(and_(ForumPost.board_id == board_id, ForumPost.parent_id == None))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    items = (await db.execute(
        query.offset((page - 1) * 20).limit(20).order_by(desc(ForumPost.is_pinned), desc(ForumPost.last_reply_at), desc(ForumPost.created_at))
    )).scalars().all()
    return ok({"items": [_thread_out(t) for t in items], "total": total, "page": page, "pages": math.ceil(total / 20)})


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: int, db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")

    key = (user.id if user else 0, thread_id)
    now = time.time()
    if key not in _view_dedup or now - _view_dedup[key] > 3600:
        p.view_count += 1
        _view_dedup[key] = now
    await db.commit()
    await db.refresh(p)

    replies = []
    for r in (p.replies or []):
        parent_author = None
        parent_content = None
        if r.parent_id:
            parent = next((x for x in (p.replies or []) if x.id == r.parent_id), None)
            if parent:
                parent_author = parent.author.username if parent.author else None
                parent_content = parent.content
        replies.append(ReplyOut(
            id=r.id, content=r.content, author=_author_out(r.author),
            parent_id=r.parent_id, parent_author=parent_author, parent_content=parent_content,
            image_urls=[], like_count=r.like_count,
            created_at=r.created_at, updated_at=r.updated_at,
        ))

    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == p.board_id))).scalar_one_or_none()
    return ok(ThreadDetailOut(
        id=p.id, title=p.title, content=p.content, author=_author_out(p.author),
        board_id=p.board_id, board_name=board.name if board else "",
        image_urls=[], is_pinned=p.is_pinned, is_locked=p.is_locked,
        view_count=p.view_count, reply_count=p.reply_count, like_count=p.like_count,
        last_reply_at=p.last_reply_at.isoformat() if p.last_reply_at else None,
        created_at=p.created_at, updated_at=p.updated_at,
        replies=replies,
    ))


# ── Create Thread ──

@router.post("/threads", status_code=201)
async def create_thread(
    body: ThreadCreate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:post")),
):
    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == body.board_id))).scalar_one_or_none()
    if not board:
        raise HTTPException(400, "板块不存在")
    p = ForumPost(
        title=body.title, content=body.content, author_id=user.id,
        board_id=body.board_id, image_ids=body.image_ids or [],
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return ok({"id": p.id})


# ── Reply ──

@router.post("/threads/{thread_id}/replies", status_code=201)
async def create_reply(
    thread_id: int, body: ReplyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:post")),
):
    thread = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not thread:
        raise HTTPException(404, "帖子不存在")
    if thread.is_locked:
        raise HTTPException(400, "帖子已锁定")

    parent_auth = None
    if body.parent_id:
        parent = (await db.execute(select(ForumPost).where(ForumPost.id == body.parent_id))).scalar_one_or_none()
        if parent:
            parent_auth = parent.author.username if parent.author else None

    r = ForumPost(
        content=body.content, author_id=user.id, board_id=thread.board_id,
        parent_id=body.parent_id, thread_id=thread_id,
        image_ids=body.image_ids or [],
    )
    db.add(r)
    thread.reply_count += 1
    thread.last_reply_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(r)

    if thread.author_id != user.id:
        await create_notification(db, thread.author_id, user.id, "reply",
            f"{user.username} 回复了你的帖子",
            f"/forum/post/{thread_id}")

    if body.parent_id and parent and parent.author_id != user.id:
        await create_notification(db, parent.author_id, user.id, "mention",
            f"{user.username} 在评论中提到了你",
            f"/forum/post/{thread_id}")

    return ok({"id": r.id})


# ── Update / Delete Thread ──

@router.put("/threads/{thread_id}")
async def update_thread(
    thread_id: int, body: ThreadUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    if p.author_id != user.id:
        raise HTTPException(403, "只能编辑自己的帖子")
    if body.title is not None:
        p.title = body.title
    if body.content is not None:
        p.content = body.content
    await db.commit()
    return ok({})


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:delete")),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    scope_perm = user.permissions and ("*" in user.permissions or "forum:manage" in user.permissions)
    if p.author_id != user.id and not scope_perm:
        raise HTTPException(403, "只能删除自己的帖子")

    child_ids = (await db.execute(select(ForumPost.id).where(ForumPost.thread_id == thread_id))).scalars().all()
    for cid in child_ids:
        await db.execute(sa_delete(ForumPost).where(ForumPost.id == cid))
    await db.delete(p)
    await db.commit()
    return ok({})


# ── Admin Actions ──

@router.post("/threads/{thread_id}/admin")
async def admin_action(
    thread_id: int, body: AdminAction,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:manage")),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    match body.action:
        case "pin": p.is_pinned = True
        case "unpin": p.is_pinned = False
        case "lock": p.is_locked = True
        case "unlock": p.is_locked = False
        case _: raise HTTPException(400, "无效操作")
    await db.commit()
    return ok({})


# ── Like Post ──

@router.post("/posts/{post_id}/like")
async def like_post(
    post_id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:post")),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    p.like_count += 1
    await db.commit()
    return ok({"like_count": p.like_count})


# ── Upload Image ──

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:post")),
):
    validate_file_size(file)
    validate_image(await file.read())
    await file.seek(0)
    data = await file.read()
    fp = await storage_service.store(db, data, file.content_type or "image/png")
    await db.flush()
    record = await storage_service.create_record(
        db, fp, filename=file.filename or "image.png",
        content_type=file.content_type or "image/png",
        uploaded_by=user.id,
    )
    await db.commit()
    return ok({"fingerprint_id": fp.id, "record_id": record.id, "url": storage_service.url(fp)})
