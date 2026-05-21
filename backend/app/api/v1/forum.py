"""论坛 API — 板块 / 帖子 / 回复"""
import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, desc, and_, or_, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.core.response import ok
from app.models.forum import ForumBoard, ForumPost
from app.models.file import File
from app.models.user import User
from app.api.v1.notifications import send_notification
from app.models.rbac import Permission
from app.utils.file_service import file_url

router = APIRouter(prefix="/forum", tags=["论坛"])

# 简单内存去重：{(user_id, thread_id): timestamp}
_view_dedup: dict[tuple, float] = {}


# ── Schemas ──

class BoardOut(BaseModel):
    id: int
    name: str
    description: str | None
    thread_count: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}


class PostAuthor(BaseModel):
    id: int
    username: str
    avatar_url: str | None = None
    model_config = {"from_attributes": True}


class ThreadOut(BaseModel):
    id: int
    title: str | None
    content: str
    author: PostAuthor | None = None
    board_id: int
    board_name: str = ""
    image_urls: list[str] = []
    is_pinned: bool
    is_locked: bool
    view_count: int
    reply_count: int
    last_reply_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class ThreadListOut(BaseModel):
    id: int
    title: str | None
    content: str
    author: PostAuthor | None = None
    image_urls: list[str] = []
    is_pinned: bool
    is_locked: bool
    view_count: int
    reply_count: int
    last_reply_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ReplyOut(BaseModel):
    id: int
    content: str
    author: PostAuthor | None = None
    parent_id: int | None
    parent_author: str | None = None  # 被引用楼层的作者
    parent_content: str | None = None  # 被引用内容预览
    image_urls: list[str] = []
    like_count: int = 0
    created_at: datetime
    updated_at: datetime | None = None
    model_config = {"from_attributes": True}


class ThreadDetailOut(BaseModel):
    id: int
    title: str | None
    content: str
    author: PostAuthor | None = None
    board_id: int
    board_name: str = ""
    image_urls: list[str] = []
    is_pinned: bool
    is_locked: bool
    view_count: int
    like_count: int = 0
    reply_count: int
    last_reply_at: datetime | None
    created_at: datetime
    updated_at: datetime
    replies: list[ReplyOut] = []
    model_config = {"from_attributes": True}


class ThreadCreate(BaseModel):
    title: str
    content: str
    board_id: int
    image_ids: list[int] = []


class ReplyCreate(BaseModel):
    content: str
    parent_id: int | None = None  # 回复哪个帖子，None=回楼主
    image_ids: list[int] = []


class ThreadUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


# ── Helpers ──

def _author(u: User | None) -> PostAuthor | None:
    if not u:
        return None
    return PostAuthor(id=u.id, username=u.username, avatar_url=u.avatar_url)


async def _resolve_images(db: AsyncSession, image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    result = await db.execute(select(File).where(File.id.in_(image_ids)))
    files = {f.id: f for f in result.scalars().all()}
    return [file_url(files[fid]) for fid in image_ids if fid in files]


async def _thread_out(t: ForumPost, board_name: str, db: AsyncSession) -> ThreadOut:
    return ThreadOut(
        id=t.id, title=t.title, content=t.content,
        author=_author(t.author), board_id=t.board_id, board_name=board_name,
        image_urls=await _resolve_images(db, t.image_ids),
        is_pinned=t.is_pinned, is_locked=t.is_locked,
        view_count=t.view_count, reply_count=t.reply_count,
        last_reply_at=t.last_reply_at,
        created_at=t.created_at, updated_at=t.updated_at,
    )


async def _thread_list_out(t: ForumPost, db: AsyncSession) -> ThreadListOut:
    return ThreadListOut(
        id=t.id, title=t.title, content=t.content[:200] if t.content else "",
        author=_author(t.author),
        image_urls=await _resolve_images(db, t.image_ids),
        is_pinned=t.is_pinned, is_locked=t.is_locked,
        view_count=t.view_count, reply_count=t.reply_count,
        last_reply_at=t.last_reply_at, created_at=t.created_at,
    )


async def _reply_out(r: ForumPost, db: AsyncSession, parent_map: dict[int, ForumPost] | None = None) -> ReplyOut:
    parent_author = None
    parent_content = None
    if r.parent_id and parent_map and r.parent_id in parent_map:
        p = parent_map[r.parent_id]
        parent_author = p.author.username if p.author else None
        parent_content = p.content[:80] if p.content else ""
    return ReplyOut(
        id=r.id, content=r.content, author=_author(r.author),
        parent_id=r.parent_id, parent_author=parent_author, parent_content=parent_content,
        image_urls=await _resolve_images(db, r.image_ids),
        like_count=r.like_count or 0,
        created_at=r.created_at, updated_at=r.updated_at,
    )


# ── Boards ──

@router.get("/boards")
async def list_boards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ForumBoard).order_by(ForumBoard.sort_order))
    boards = result.scalars().all()
    out = []
    for b in boards:
        count = (await db.execute(
            select(func.count(ForumPost.id)).where(
                and_(ForumPost.board_id == b.id, ForumPost.parent_id == None)
            )
        )).scalar() or 0
        out.append(BoardOut(id=b.id, name=b.name, description=b.description, thread_count=count, created_at=b.created_at))
    return ok(out)


# ── Search ──

@router.get("/search")
async def search_threads(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    like = f"%{q}%"
    base = select(ForumPost).where(
        and_(
            ForumPost.parent_id == None,
            or_(ForumPost.title.contains(like), ForumPost.content.contains(like)),
        )
    ).order_by(desc(ForumPost.is_pinned), desc(ForumPost.last_reply_at))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    items = (await db.execute(base.offset((page - 1) * size).limit(size))).scalars().all()

    return ok({
        "items": [await _thread_list_out(t, db) for t in items],
        "total": total, "page": page, "pages": math.ceil(total / size),
        "query": q,
    })


# ── Threads list ──

@router.get("/boards/{board_id}/threads")
async def list_threads(
    board_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == board_id))).scalar_one_or_none()
    if not board:
        raise HTTPException(404, "板块不存在")

    q = select(ForumPost).where(
        and_(ForumPost.board_id == board_id, ForumPost.parent_id == None)
    ).order_by(desc(ForumPost.is_pinned), desc(ForumPost.last_reply_at))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()

    return ok({
        "items": [await _thread_list_out(t, db) for t in items],
        "total": total, "page": page, "pages": math.ceil(total / size),
    })


# ── Thread detail ──

@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    t = (await db.execute(select(ForumPost).where(
        and_(ForumPost.id == thread_id, ForumPost.parent_id == None)
    ))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    # 去重：同用户/IP + 同帖子 5分钟内不重复计数
    viewer_key = (user.id if user else (request.client.host if request.client else "anon"), thread_id)
    now = time.time()
    should_count = viewer_key not in _view_dedup or (now - _view_dedup[viewer_key]) > 300
    if should_count:
        _view_dedup[viewer_key] = now
        # 定期清理过期条目
        if len(_view_dedup) > 5000:
            _view_dedup.clear()

    # 先读取所有数据（commit 后对象过期，不能再访问任何属性）
    board_name = t.board.name if t.board else ""
    author = _author(t.author)
    image_urls = await _resolve_images(db, t.image_ids)

    # 查询所有楼层（thread_id = 根帖子 id）
    all_posts = (await db.execute(
        select(ForumPost).where(ForumPost.thread_id == thread_id).order_by(ForumPost.created_at)
    )).scalars().all()

    # 构建 parent_map：所有帖子 id → post，用于引用信息
    parent_map: dict[int, ForumPost] = {t.id: t}
    for p in all_posts:
        parent_map[p.id] = p

    replies = [await _reply_out(r, db, parent_map) for r in all_posts]

    # 快照所有标量字段（commit 前）
    tid, ttitle, tcontent = t.id, t.title, t.content
    tboard_id = t.board_id
    tis_pinned, tis_locked = t.is_pinned, t.is_locked
    tview_count = t.view_count + (1 if should_count else 0)
    treply_count = t.reply_count
    tlike_count = t.like_count or 0
    tlast_reply_at = t.last_reply_at
    tcreated_at, tupdated_at = t.created_at, t.updated_at

    t.view_count = tview_count
    await db.commit()

    return ok(ThreadDetailOut(
        id=tid, title=ttitle, content=tcontent,
        author=author, board_id=tboard_id, board_name=board_name,
        image_urls=image_urls,
        is_pinned=tis_pinned, is_locked=tis_locked,
        view_count=tview_count, reply_count=treply_count,
        last_reply_at=tlast_reply_at,
        created_at=tcreated_at, updated_at=tupdated_at,
        replies=replies,
    ))


# ── Create thread ──

@router.post("/threads", status_code=201)
async def create_thread(
    body: ThreadCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = (await db.execute(select(ForumBoard).where(ForumBoard.id == body.board_id))).scalar_one_or_none()
    if not board:
        raise HTTPException(404, "板块不存在")

    t = ForumPost(
        title=body.title, content=body.content,
        author_id=user.id, board_id=body.board_id,
        image_ids=body.image_ids,
        last_reply_at=datetime.now(timezone.utc),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return ok(await _thread_out(t, board.name, db))


# ── Create reply ──

@router.post("/threads/{thread_id}/replies", status_code=201)
async def create_reply(
    thread_id: int,
    body: ReplyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    thread = (await db.execute(select(ForumPost).where(
        and_(ForumPost.id == thread_id, ForumPost.parent_id == None)
    ))).scalar_one_or_none()
    if not thread:
        raise HTTPException(404, "帖子不存在")
    if thread.is_locked:
        raise HTTPException(400, "帖子已锁定，无法回复")

    # 解析 parent_id：body 传了就用 body 的，否则回楼主
    parent_id = body.parent_id if body.parent_id else thread_id
    if parent_id != thread_id:
        parent_post = (await db.execute(select(ForumPost).where(ForumPost.id == parent_id))).scalar_one_or_none()
        if not parent_post or parent_post.thread_id != thread_id:
            raise HTTPException(400, "无效的引用楼层")

    reply = ForumPost(
        content=body.content, author_id=user.id,
        board_id=thread.board_id, parent_id=parent_id, thread_id=thread_id,
        image_ids=body.image_ids,
    )
    # 通知被回复者（提前查询，commit 前操作）
    notify_author_id = None
    notify_content = ""
    if parent_id != user.id:  # 不给自己发通知
        target = (await db.execute(select(ForumPost).where(ForumPost.id == parent_id))).scalar_one_or_none()
        if target and target.author_id != user.id:
            notify_author_id = target.author_id
            preview = body.content[:60] + ("..." if len(body.content) > 60 else "")
            notify_content = f"{user.username} 回复了你：{preview}"

    reply = ForumPost(
        content=body.content, author_id=user.id,
        board_id=thread.board_id, parent_id=parent_id, thread_id=thread_id,
        image_ids=body.image_ids,
    )
    db.add(reply)
    thread.reply_count += 1
    thread.last_reply_at = datetime.now(timezone.utc)

    if notify_author_id:
        await send_notification(db, notify_author_id, user.id, "reply",
                                notify_content, f"/forum/post/{thread_id}#floor-{reply.id}",
                                sender_name=user.username)

    await db.commit()
    await db.refresh(reply)

    # Build parent_map for reply output
    all_posts = (await db.execute(
        select(ForumPost).where(ForumPost.thread_id == thread_id)
    )).scalars().all()
    pmap = {p.id: p for p in all_posts}
    return ok(await _reply_out(reply, db, pmap))


# ── Edit thread ──

@router.put("/threads/{thread_id}")
async def update_thread(
    thread_id: int,
    body: ThreadUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.author_id != user.id and not user.has_permission("forum.manage"):
        raise HTTPException(403, "无权编辑")

    if body.title is not None and t.parent_id is None:
        t.title = body.title
    if body.content is not None:
        t.content = body.content
    await db.commit()
    return ok({"id": t.id})


# ── Delete thread / reply ──

@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")
    if t.author_id != user.id and not user.has_permission("forum:delete"):
        raise HTTPException(403, "无权删除")

    # If it's a thread, delete all replies too
    if t.parent_id is None:
        await db.execute(
            sa_delete(ForumPost).where(ForumPost.parent_id == thread_id)
        )
    else:
        # It's a reply, decrement reply count on parent
        parent = (await db.execute(select(ForumPost).where(ForumPost.id == t.parent_id))).scalar_one_or_none()
        if parent:
            parent.reply_count = max(0, parent.reply_count - 1)

    await db.delete(t)
    await db.commit()
    return ok({})


# ── Admin: pin / lock ──

class AdminAction(BaseModel):
    action: str  # pin | unpin | lock | unlock


@router.post("/threads/{thread_id}/admin")
async def admin_thread_action(
    thread_id: int,
    body: AdminAction,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.has_permission("forum:manage"):
        raise HTTPException(403, "需要论坛管理权限")

    t = (await db.execute(select(ForumPost).where(ForumPost.id == thread_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "帖子不存在")

    match body.action:
        case "pin": t.is_pinned = True
        case "unpin": t.is_pinned = False
        case "lock": t.is_locked = True
        case "unlock": t.is_locked = False
        case _: raise HTTPException(400, f"无效操作: {body.action}")

    await db.commit()
    return ok({"id": t.id, "is_pinned": t.is_pinned, "is_locked": t.is_locked})


# ── Like post ──

# 简单内存去重点赞：{(user_id, post_id): True}
_post_likes: set[tuple] = set()


@router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")

    key = (user.id, post_id)
    if key in _post_likes:
        _post_likes.discard(key)
        p.like_count = max(0, (p.like_count or 0) - 1)
        liked = False
    else:
        _post_likes.add(key)
        p.like_count = (p.like_count or 0) + 1
        liked = True

    await db.commit()
    return ok({"liked": liked, "like_count": p.like_count})
