"""通知 — 列表 / 未读数 / 标记已读 / SSE 实时推送 / 内部发送"""
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any
from el_token.ElLogic import ElLogic
from el_token.ElToken import ElToken
from el_token.ElSettings import ElSettings
from app.infrastructure.Response import ok
from app.infrastructure.sse.PresenceTracker import push as presence_push
from app.notification.entity.Notification import Notification
from app.identity.entity.User import User

router = APIRouter(prefix="/notifications", tags=["通知"])

async def create_notification(
    db: AsyncSession, receiver_id: int, sender_id: int | None,
    type_: str, content: str, link: str | None = None,
):
    """内部调用：写入通知并实时推送"""
    now = datetime.now(timezone.utc)
    n = Notification(
        receiver_id=receiver_id, sender_id=sender_id,
        type=type_, content=content, link=link, created_at=now,
    )
    db.add(n)
    await db.flush()
    await presence_push({
        "id": n.id, "type": n.type, "content": n.content, "link": n.link,
        "sender_name": None, "is_read": False, "created_at": now.isoformat(),
    }, user_id=receiver_id)


# ── REST ──

@router.get("")
async def list_notifications(
    page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("notification:list")),
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
    _=Depends(require_perm_any("notification:count")),
):
    count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.receiver_id == user.id, Notification.is_read == False,
        )
    )).scalar() or 0
    return ok({"unread": count})


@router.post("/{id}/read")
async def mark_read(
    id: int, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("notification:read")),
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
    _=Depends(require_perm_any("notification:read-all")),
):
    await db.execute(
        update(Notification).where(
            Notification.receiver_id == user.id, Notification.is_read == False
        ).values(is_read=True)
    )
    await db.commit()
    return ok({})
