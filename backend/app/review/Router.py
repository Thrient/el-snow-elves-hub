"""审核中心 API"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm
from app.infrastructure.Response import ok
from app.identity.entity.User import User
from app.review.entity.ReviewRecord import ReviewRecord
from app.review.Schema.DecideRequest import DecideRequest
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.notification.Router import create_notification

router = APIRouter(prefix="/reviews", tags=["审核中心"])


@router.get("/pending", dependencies=[Depends(require_perm("review:list"))])
async def list_pending(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count(ReviewRecord.id)).where(ReviewRecord.status == "pending")
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(ReviewRecord)
        .where(ReviewRecord.status == "pending")
        .order_by(ReviewRecord.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    records = (await db.execute(q)).scalars().all()

    items = []
    for r in records:
        title = ""
        link = ""
        author_id = None

        if r.content_type == "post":
            p = (await db.execute(
                select(ForumPost).where(ForumPost.id == r.content_id)
            )).scalar_one_or_none()
            if p:
                title = p.title or (p.content[:100] if p.content else "")
                author_id = p.author_id
                link = f"/forum/post/{p.id}" if p.thread_id is None else f"/forum/post/{p.thread_id}"
        elif r.content_type == "reply":
            p = (await db.execute(
                select(ForumPost).where(ForumPost.id == r.content_id)
            )).scalar_one_or_none()
            if p:
                title = (p.content or "")[:100]
                author_id = p.author_id
                link = f"/forum/post/{p.thread_id}"
        elif r.content_type == "task":
            t = (await db.execute(
                select(TaskModel).where(TaskModel.id == r.content_id)
            )).scalar_one_or_none()
            if t:
                title = t.title
                author_id = t.author_id
                link = f"/market/{t.id}"
        elif r.content_type == "comment":
            c = (await db.execute(
                select(Comment).where(Comment.id == r.content_id)
            )).scalar_one_or_none()
            if c:
                title = (c.content or "")[:100]
                author_id = c.user_id
                link = f"/market/{c.task_id}"

        items.append({
            "id": r.id,
            "content_type": r.content_type,
            "content_id": r.content_id,
            "title": title,
            "status": r.status,
            "reason": r.reason,
            "author_id": author_id,
            "link": link,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
        })

    return ok({"items": items, "total": total})


@router.post("/{record_id}/decide", dependencies=[Depends(require_perm("review:decide"))])
async def decide_review(
    record_id: int,
    body: DecideRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = (await db.execute(
        select(ReviewRecord).where(ReviewRecord.id == record_id)
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "审核记录不存在")
    if rec.status != "pending":
        raise HTTPException(400, "该记录已审核")

    rec.status = body.status
    rec.reason = body.reason
    rec.reviewer_id = user.id

    if rec.content_type in ("post", "reply"):
        p = (await db.execute(
            select(ForumPost).where(ForumPost.id == rec.content_id)
        )).scalar_one_or_none()
        if p:
            p.status = "published" if body.status == "approved" else "rejected"
            if body.status == "rejected" and p.author_id:
                reason = body.reason or "违反社区规范"
                is_thread = p.thread_id is None
                await create_notification(
                    db, receiver_id=p.author_id, sender_id=user.id,
                    type_="review_rejected",
                    content=f"你的{'帖子' if is_thread else '回复'}未通过审核：{reason}",
                    link=f"/forum/post/{p.id}" if is_thread else f"/forum/post/{p.thread_id}",
                )
    elif rec.content_type == "task":
        t = (await db.execute(
            select(TaskModel).where(TaskModel.id == rec.content_id)
        )).scalar_one_or_none()
        if t:
            t.status = "published" if body.status == "approved" else "rejected"
            if body.status == "rejected":
                reason = body.reason or "违反社区规范"
                await create_notification(
                    db, receiver_id=t.author_id, sender_id=user.id,
                    type_="review_rejected",
                    content=f"你的任务「{t.title}」未通过审核：{reason}",
                    link=f"/market/{t.id}",
                )
    elif rec.content_type == "comment":
        c = (await db.execute(
            select(Comment).where(Comment.id == rec.content_id)
        )).scalar_one_or_none()
        if c:
            c.status = "published" if body.status == "approved" else "rejected"
            if body.status == "rejected":
                reason = body.reason or "违反社区规范"
                await create_notification(
                    db, receiver_id=c.user_id, sender_id=user.id,
                    type_="review_rejected",
                    content=f"你的评论未通过审核：{reason}",
                    link=f"/market/{c.task_id}",
                )

    await db.commit()
    return ok()
