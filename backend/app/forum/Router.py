"""论坛 — 板块 / 帖子 / 回复 / 搜索 / 点赞"""
from __future__ import annotations
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, and_, or_, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, get_optional_user, require_owner, require_perm_any, require_verified
from app.infrastructure.Response import ok
from app.forum.entity.ForumBoard import ForumBoard
from app.forum.entity.ForumPost import ForumPost
from app.forum.entity.ForumLike import ForumLike
from app.identity.entity.User import User
from app.infrastructure.storage.StorageService import storage_service
from app.notification.Router import create_notification
from app.infrastructure.EventBus import publish_review
from app.audit.service import log_audit

router = APIRouter(prefix="/forum", tags=["论坛"])


async def _resolve_images(db: AsyncSession, image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    from app.infrastructure.storage.entity.FileRecord import FileRecord
    recs = (await db.execute(
        select(FileRecord).where(FileRecord.id.in_(image_ids))
    )).scalars().all()
    rec_map = {r.id: r for r in recs}
    return [f"/api/v1/files/{rec_map[rid].fingerprint.sha256}" for rid in image_ids if rid in rec_map]



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
async def list_boards(db: AsyncSession = Depends(get_db),
                      _=Depends(require_perm_any("forum:boards"))):
    stmt = (
        select(ForumBoard, func.count(ForumPost.id).label("thread_count"))
        .outerjoin(ForumPost, and_(ForumPost.board_id == ForumBoard.id, ForumPost.parent_id == None))
        .group_by(ForumBoard.id)
        .order_by(ForumBoard.sort_order)
    )
    rows = (await db.execute(stmt)).all()
    return ok([
        BoardOut(id=b.id, name=b.name, description=b.description,
                 thread_count=tc, created_at=b.created_at)
        for b, tc in rows
    ])


# ── Search ──

@router.get("/search")
async def search_threads(
    q: str = Query(""), page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:search")),
):
    query = select(ForumPost).where(and_(ForumPost.parent_id == None, ForumPost.title.contains(q), ForumPost.status == "published"))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    items = (await db.execute(query.offset((page - 1) * 20).limit(20).order_by(desc(ForumPost.created_at)))).scalars().all()
    return ok({"items": [_thread_out(t) for t in items], "total": total, "page": page, "pages": math.ceil(total / 20)})


# ── Threads ──

@router.get("/boards/{board_id}/threads")
async def list_threads(
    board_id: int, page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:threads")),
):
    query = select(ForumPost).where(and_(ForumPost.board_id == board_id, ForumPost.parent_id == None, ForumPost.status == "published"))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    items = (await db.execute(
        query.offset((page - 1) * 20).limit(20).order_by(desc(ForumPost.is_pinned), desc(ForumPost.last_reply_at), desc(ForumPost.created_at))
    )).scalars().all()
    return ok({"items": [_thread_out(t) for t in items], "total": total, "page": page, "pages": math.ceil(total / 20)})


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: int, db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("forum:view")),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p or p.status != "published":
        raise HTTPException(404, "帖子不存在")

    from app.infrastructure.Redis import get_redis
    r = get_redis()
    vk = f"view:{user.id if user else 0}:{thread_id}"
    if not r.exists(vk):
        r.setex(vk, 3600, "1")
        p.view_count += 1
    await db.commit()
    await db.refresh(p)

    # Collect all post IDs in this thread + query current user's likes
    all = list((await db.execute(
        select(ForumPost).where(ForumPost.thread_id == thread_id, ForumPost.status != "rejected").order_by(ForumPost.created_at)
    )).scalars().all())
    thread_post_ids = {p.id, *(r.id for r in all)}
    liked_ids: set[int] = set()
    if user:
        likes = (await db.execute(
            select(ForumLike.post_id).where(
                and_(ForumLike.post_id.in_(thread_post_ids), ForumLike.user_id == user.id)
            )
        )).scalars().all()
        liked_ids = set(likes)

    # Compute like counts from forum_likes table
    like_counts: dict[int, int] = dict.fromkeys(thread_post_ids, 0)
    count_rows = (await db.execute(
        select(ForumLike.post_id, func.count(ForumLike.id))
        .where(ForumLike.post_id.in_(thread_post_ids))
        .group_by(ForumLike.post_id)
    )).all()
    for post_id, cnt in count_rows:
        like_counts[post_id] = cnt

    replies = []
    for r in all:
        parent_author = None
        parent_content = None
        if r.parent_id:
            parent = next((x for x in all if x.id == r.parent_id), None)
            if parent:
                parent_author = parent.author.username if parent.author else None
                parent_content = parent.content
        replies.append(ReplyOut(
            id=r.id, content=r.content, author=_author_out(r.author),
            parent_id=r.parent_id, parent_author=parent_author, parent_content=parent_content,
            image_urls=await _resolve_images(db, r.image_ids), like_count=like_counts.get(r.id, 0), liked=r.id in liked_ids,
            created_at=r.created_at, updated_at=r.updated_at,
        ))

    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == p.board_id))).scalar_one_or_none()
    return ok(ThreadDetailOut(
        id=p.id, title=p.title, content=p.content, author=_author_out(p.author),
        board_id=p.board_id, board_name=board.name if board else "",
        image_urls=await _resolve_images(db, p.image_ids), is_pinned=p.is_pinned, is_locked=p.is_locked,
        view_count=p.view_count, reply_count=p.reply_count, like_count=like_counts.get(p.id, 0),
        liked=p.id in liked_ids,
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
    _v=Depends(require_verified),
):
    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == body.board_id))).scalar_one_or_none()
    if not board:
        raise HTTPException(400, "板块不存在")

    # Create FileRecords from fingerprint_ids
    record_ids: list[int] = []
    if body.image_fingerprint_ids:
        for fp_id in body.image_fingerprint_ids:
            record = await storage_service.create_record_from_fingerprint(
                db, fp_id, filename="forum_image", uploaded_by=user.id,
            )
            record_ids.append(record.id)

    p = ForumPost(
        title=body.title, content=body.content, author_id=user.id,
        board_id=body.board_id, image_ids=record_ids,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    await log_audit(user, "create", "post", p.id, "thread: " + body.title, "")
    try:
        await publish_review("post", p.id)
    except Exception as e:
        print(f"Failed to enqueue review for post #{p.id}: {e}")
    return ok({"id": p.id})


# ── Reply ──

@router.post("/threads/{thread_id}/replies", status_code=201)
async def create_reply(
    thread_id: int, body: ReplyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:reply")),
    _v=Depends(require_verified),
):
    thread = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not thread:
        raise HTTPException(404, "帖子不存在")
    if thread.is_locked:
        raise HTTPException(400, "帖子已锁定")

    parent = None
    parent_auth = None
    parent_content = None
    if body.parent_id:
        parent = (await db.execute(select(ForumPost).where(ForumPost.id == body.parent_id))).scalar_one_or_none()
        if parent:
            parent_auth = parent.author.username if parent.author else None
            parent_content = parent.content

    # Create FileRecords from fingerprint_ids
    record_ids: list[int] = []
    if body.image_fingerprint_ids:
        for fp_id in body.image_fingerprint_ids:
            record = await storage_service.create_record_from_fingerprint(
                db, fp_id, filename="forum_image", uploaded_by=user.id,
            )
            record_ids.append(record.id)

    r = ForumPost(
        content=body.content, author_id=user.id, board_id=thread.board_id,
        parent_id=body.parent_id or thread_id, thread_id=thread_id,
        image_ids=record_ids,
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

    if parent and parent.author_id != user.id:
        await create_notification(db, parent.author_id, user.id, "mention",
            f"{user.username} 在评论中提到了你",
            f"/forum/post/{thread_id}")

    await log_audit(user, "create", "reply", r.id, "", "")
    try:
        await publish_review("reply", r.id)
    except Exception as e:
        print(f"Failed to enqueue review for reply #{r.id}: {e}")

    return ok(ReplyOut(
        id=r.id, content=r.content, author=_author_out(user),
        parent_id=r.parent_id if r.parent_id != thread_id else None,
        parent_author=parent_auth,
        parent_content=parent_content,
        image_urls=await _resolve_images(db, record_ids), like_count=0, liked=False,
        created_at=r.created_at, updated_at=r.updated_at,
    ))


# ── Update / Delete Thread ──

@router.put("/threads/{thread_id}")
async def update_thread(
    thread_id: int, body: ThreadUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:update")),
    _v=Depends(require_verified),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    await require_owner(p, user)
    if body.title is not None:
        p.title = body.title
    if body.content is not None:
        p.content = body.content
    await db.commit()
    await log_audit(user, "update", "post", thread_id, "", "")
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
    await require_owner(p, user)

    child_ids = (await db.execute(select(ForumPost.id).where(ForumPost.thread_id == thread_id))).scalars().all()
    all_ids = [thread_id, *child_ids]
    await db.execute(sa_delete(ForumLike).where(ForumLike.post_id.in_(all_ids)))
    p_title = p.title
    p_id = p.id
    for cid in child_ids:
        await db.execute(sa_delete(ForumPost).where(ForumPost.id == cid))
    await db.delete(p)
    await db.commit()
    await log_audit(user, "delete", "post", p_id, "thread: " + p_title, "")
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
    await log_audit(user, "update", "post", thread_id, "admin: " + body.action, "")
    return ok({})


# ── Like Post ──

@router.post("/posts/{post_id}/like")
async def like_post(
    post_id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("forum:like")),
    _v=Depends(require_verified),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    existing = (await db.execute(
        select(ForumLike).where(and_(ForumLike.post_id == post_id, ForumLike.user_id == user.id))
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
        cnt = (await db.execute(
            select(func.count(ForumLike.id)).where(ForumLike.post_id == post_id)
        )).scalar() or 0
        return ok({"liked": False, "like_count": cnt})
    db.add(ForumLike(post_id=post_id, user_id=user.id))
    await db.commit()
    cnt = (await db.execute(
        select(func.count(ForumLike.id)).where(ForumLike.post_id == post_id)
    )).scalar() or 0
    return ok({"liked": True, "like_count": cnt})
