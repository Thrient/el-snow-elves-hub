"""通知 API — 列表 / 未读数 / 标记已读 / SSE 实时推送"""
import asyncio
import json
import math

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.response import ok
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["通知"])

# ── 内存事件总线 ──
_streams: dict[int, list[asyncio.Queue]] = {}
_lock = asyncio.Lock()


async def _subscribe(user_id: int) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    async with _lock:
        _streams.setdefault(user_id, []).append(q)
    return q


async def _unsubscribe(user_id: int, q: asyncio.Queue):
    async with _lock:
        if user_id in _streams:
            _streams[user_id] = [x for x in _streams[user_id] if x is not q]
            if not _streams[user_id]:
                del _streams[user_id]


async def _publish(user_id: int, data: dict):
    async with _lock:
        queues = _streams.get(user_id, [])
    for q in queues:
        await q.put(data)


# ── Schemas ──

class NotificationOut(BaseModel):
    id: int
    type: str
    content: str
    link: str | None = None
    sender_name: str | None = None
    is_read: bool
    created_at: str

    model_config = {"from_attributes": True}


async def send_notification(db: AsyncSession, receiver_id: int, sender_id: int | None,
                            type_: str, content: str, link: str | None = None,
                            sender_name: str = ""):
    """仅供内部调用的通知发送函数"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    n = Notification(
        receiver_id=receiver_id, sender_id=sender_id,
        type=type_, content=content, link=link,
        created_at=now,
    )
    db.add(n)
    await db.flush()
    # 推送实时事件
    await _publish(receiver_id, {
        "id": n.id, "type": n.type, "content": n.content, "link": n.link,
        "sender_name": sender_name,
        "is_read": False, "created_at": now.isoformat(),
    })


# ── SSE 流 ──

async def _sse_event_generator(user_id: int):
    q = await _subscribe(user_id)
    try:
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30.0)
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        await _unsubscribe(user_id, q)


@router.get("/stream")
async def notification_stream(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    """SSE 实时推送通知，nginx 需 proxy_buffering off"""
    from app.core.security import decode_access_token
    from app.core.online_tracker import connect as online_connect, disconnect as online_disconnect

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "token 无效")
    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(401, "token 数据缺失")

    web_client_id, _ = await online_connect("web")

    async def tracked_generator():
        try:
            async for chunk in _sse_event_generator(user_id):
                yield chunk
        finally:
            await online_disconnect("web", web_client_id)

    return StreamingResponse(
        tracked_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── REST 端点 ──

@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Notification).where(Notification.receiver_id == user.id).order_by(desc(Notification.created_at))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    items = (await db.execute(q.offset((page - 1) * size).limit(size))).scalars().all()

    return ok({
        "items": [
            {
                "id": n.id, "type": n.type, "content": n.content, "link": n.link,
                "sender_name": n.sender.username if n.sender else None,
                "is_read": n.is_read, "created_at": n.created_at.isoformat(),
            }
            for n in items
        ],
        "unread": (await db.execute(
            select(func.count(Notification.id)).where(
                Notification.receiver_id == user.id, Notification.is_read == False
            )
        )).scalar() or 0,
        "total": total, "page": page, "pages": math.ceil(total / size) if total else 0,
    })


@router.get("/unread-count")
async def unread_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.receiver_id == user.id,
            Notification.is_read == False,
        )
    )).scalar() or 0
    return ok({"unread": count})


@router.post("/{id}/read")
async def mark_read(
    id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(select(Notification).where(
        Notification.id == id, Notification.receiver_id == user.id
    ))).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "通知不存在")
    n.is_read = True
    await db.commit()
    return ok({})


@router.post("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification).where(
            Notification.receiver_id == user.id, Notification.is_read == False
        ).values(is_read=True)
    )
    await db.commit()
    return ok({})
