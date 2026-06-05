"""AI 审核 Worker — 消费 RabbitMQ → Ollama 审核 → 直接写 DB"""
import asyncio
import base64
import json

import httpx
from sqlalchemy import select

from app.infrastructure.Database import async_session
from app.infrastructure.EventBus import close_bus, consume_review, publish_review
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.identity.entity.User import User
from app.review.entity.ReviewRecord import ReviewRecord
from app.notification.Router import create_notification

AI_EMAIL = "ai-reviewer@elarion.cn"
OLLAMA_URL = "http://ollama:11434/api/generate"
MODEL = "minicpm-v:8b"

REVIEW_PROMPT = """你是内容安全审核员。返回 JSON：{"action":"pass|pending|reject","reason":"..."}

action 含义：
- pass：内容正常，未发现违规 → 直接放行
- pending：有可疑迹象但拿不准 → 交人工判断
- reject：明确、严重违规，你有十足把握 → 直接拒绝

关键规则：
- 没发现问题 → action 必须是 pass，不要设为 pending 或 reject
- 只有看到具体违规内容时才用 pending 或 reject
- 不确定 = 没发现 = pass
- 宁可 pass 漏过，不要 pending 误拦

判断方向：
1. 明显色情（生殖器暴露）→ reject；有点擦边但看不清 → pass
2. 辱骂、威胁特定用户 → reject；一般争论吐槽 → pass
3. 极端政治 → reject；普通讨论 → pass

reason 简要说明判断依据。

待审：\n"""

_ai_user_id: int | None = None


async def _get_ai_user_id() -> int:
    global _ai_user_id
    if _ai_user_id is None:
        async with async_session() as db:
            user = (await db.execute(
                select(User).where(User.email == AI_EMAIL)
            )).scalar_one_or_none()
            if not user:
                raise RuntimeError(f"AI 审核员不存在: {AI_EMAIL}")
            _ai_user_id = user.id
    return _ai_user_id


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 Ollama 审查，返回 {"action": "pass"|"pending"|"reject"|None, "reason": str}"""
    prompt = REVIEW_PROMPT + text

    image_b64s: list[str] = []
    if image_urls:
        async with httpx.AsyncClient(timeout=120) as cli:
            for url in image_urls:
                try:
                    resp = await cli.get(url)
                    if resp.status_code == 200:
                        b64 = base64.b64encode(resp.content).decode()
                        image_b64s.append(b64)
                except Exception:
                    pass

    last_error = None
    for attempt in range(3):
        try:
            body: dict = {
                "model": MODEL, "prompt": prompt,
                "stream": False, "format": "json", "keep_alive": "10m",
            }
            if image_b64s:
                body["images"] = image_b64s
            async with httpx.AsyncClient(timeout=120) as cli:
                resp = await cli.post(OLLAMA_URL, json=body)
                data = resp.json()
                raw = data["response"]
                result = json.loads(raw)
                action = result.get("action", "pending")
                reason = result.get("reason", "")
                if action not in ("pass", "pending", "reject"):
                    action = "pending"
                if not reason:
                    reason = "内容正常" if action == "pass" else "无法确定" if action == "pending" else "违规内容"
                return {"action": action, "reason": reason}
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError):
            last_error = "network error"
        except Exception as e:
            last_error = str(e)[:100]
        if attempt < 2:
            await asyncio.sleep(2)
    # 3 次重试都失败
    print(f"AI review failed after 3 retries: {last_error}")
    return {"action": None, "reason": last_error}


async def _resolve_images(image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    async with async_session() as db:
        recs = (await db.execute(
            select(FileRecord).where(FileRecord.id.in_(image_ids))
        )).scalars().all()
        return [storage_service.url(r.fingerprint) for r in recs]


async def _notify_rejected(
    db, content_type: str, content_id: int, author_id: int | None, title: str, reason: str,
):
    """通知作者内容被拒绝"""
    if not author_id:
        return
    type_label = {"post": "帖子", "reply": "回复", "task": "任务", "comment": "评论"}
    label = type_label.get(content_type, "内容")
    link = ""
    if content_type == "post":
        link = f"/forum/post/{content_id}"
    elif content_type == "reply":
        p = (await db.execute(select(ForumPost).where(ForumPost.id == content_id))).scalar_one_or_none()
        link = f"/forum/post/{p.thread_id}" if (p and p.thread_id) else ""
    elif content_type == "task":
        link = f"/market/{content_id}"
    elif content_type == "comment":
        c = (await db.execute(select(Comment).where(Comment.id == content_id))).scalar_one_or_none()
        link = f"/market/{c.task_id}" if (c and c.task_id) else ""
    await create_notification(
        db, receiver_id=author_id, sender_id=None,
        type_="review_rejected",
        content=f"你的{label}「{title[:30]}」未通过审核：{reason}",
        link=link,
    )


async def _handle_message(data: dict):
    """处理单条审核消息 — 三态：pass→通过 / pending→人工 / reject→拒绝+通知"""
    type_ = data["type"]
    item_id = data["id"]
    ai_user_id = await _get_ai_user_id()

    if type_ in ("post", "reply"):
        async with async_session() as db:
            p = (await db.execute(
                select(ForumPost).where(ForumPost.id == item_id)
            )).scalar_one_or_none()
            if not p or p.status != "published":
                return
            text = (p.title or "") + "\n" + (p.content or "")
            image_ids = p.image_ids
            author_id = p.author_id
            title = p.title or (p.content or "")[:30]
        images = await _resolve_images(image_ids)
        result = await ai_review_text(text, images)
        if result["action"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        action = result["action"]
        print(f"AI [{action}] {type_} #{item_id}: {result['reason']}")

        async with async_session() as db:
            if action == "pass":
                db.add(ReviewRecord(
                    content_type=type_, content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            elif action == "reject":
                db.add(ReviewRecord(
                    content_type=type_, content_id=item_id,
                    reviewer_id=ai_user_id, status="rejected",
                    reason=result["reason"],
                ))
                p = (await db.execute(
                    select(ForumPost).where(ForumPost.id == item_id)
                )).scalar_one_or_none()
                if p:
                    p.status = "rejected"
                await db.flush()
                await _notify_rejected(db, type_, item_id, author_id, title, result["reason"])
            else:  # pending
                db.add(ReviewRecord(
                    content_type=type_, content_id=item_id,
                    reviewer_id=None, status="pending",
                    reason=result["reason"],
                ))
                p = (await db.execute(
                    select(ForumPost).where(ForumPost.id == item_id)
                )).scalar_one_or_none()
                if p:
                    p.status = "pending"
            await db.commit()

    elif type_ == "task":
        async with async_session() as db:
            t = (await db.execute(
                select(TaskModel).where(TaskModel.id == item_id)
            )).scalar_one_or_none()
            if not t or t.status != "published":
                return
            text = f"{t.title}\n{t.description or ''}"
            cover_id = t.cover_record_id
            author_id = t.author_id
            title = t.title
        images = await _resolve_images([cover_id] if cover_id else [])
        result = await ai_review_text(text, images)
        if result["action"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        action = result["action"]
        print(f"AI [{action}] task #{item_id}: {result['reason']}")

        async with async_session() as db:
            if action == "pass":
                db.add(ReviewRecord(
                    content_type="task", content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            elif action == "reject":
                db.add(ReviewRecord(
                    content_type="task", content_id=item_id,
                    reviewer_id=ai_user_id, status="rejected",
                    reason=result["reason"],
                ))
                t = (await db.execute(
                    select(TaskModel).where(TaskModel.id == item_id)
                )).scalar_one_or_none()
                if t:
                    t.status = "rejected"
                await db.flush()
                await _notify_rejected(db, "task", item_id, author_id, title, result["reason"])
            else:  # pending
                db.add(ReviewRecord(
                    content_type="task", content_id=item_id,
                    reviewer_id=None, status="pending",
                    reason=result["reason"],
                ))
                t = (await db.execute(
                    select(TaskModel).where(TaskModel.id == item_id)
                )).scalar_one_or_none()
                if t:
                    t.status = "pending"
            await db.commit()

    elif type_ == "comment":
        async with async_session() as db:
            c = (await db.execute(
                select(Comment).where(Comment.id == item_id)
            )).scalar_one_or_none()
            if not c or c.status != "published":
                return
            text = c.content
            author_id = c.user_id
        result = await ai_review_text(text)
        if result["action"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        action = result["action"]
        print(f"AI [{action}] comment #{item_id}: {result['reason']}")

        async with async_session() as db:
            if action == "pass":
                db.add(ReviewRecord(
                    content_type="comment", content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            elif action == "reject":
                db.add(ReviewRecord(
                    content_type="comment", content_id=item_id,
                    reviewer_id=ai_user_id, status="rejected",
                    reason=result["reason"],
                ))
                c = (await db.execute(
                    select(Comment).where(Comment.id == item_id)
                )).scalar_one_or_none()
                if c:
                    c.status = "rejected"
                await db.flush()
                await _notify_rejected(db, "comment", item_id, author_id, (text or "")[:30], result["reason"])
            else:  # pending
                db.add(ReviewRecord(
                    content_type="comment", content_id=item_id,
                    reviewer_id=None, status="pending",
                    reason=result["reason"],
                ))
                c = (await db.execute(
                    select(Comment).where(Comment.id == item_id)
                )).scalar_one_or_none()
                if c:
                    c.status = "pending"
            await db.commit()

    else:
        print(f"AI review worker: unknown type '{type_}' id={item_id}, skipped")


async def _catch_up_unreviewed():
    """一次性扫描：把已发布但未审核的内容重新入队"""
    async with async_session() as db:
        posts = (await db.execute(
            select(ForumPost).where(ForumPost.status == "published")
        )).scalars().all()
        for p in posts:
            kind = "post" if p.thread_id is None else "reply"
            await publish_review(kind, p.id)
        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.status == "published")
        )).scalars().all()
        for t in tasks:
            await publish_review("task", t.id)
        comments = (await db.execute(
            select(Comment).where(Comment.status == "published")
        )).scalars().all()
        for c in comments:
            await publish_review("comment", c.id)
    print(f"AI review catch-up: {len(posts)} posts, {len(tasks)} tasks, {len(comments)} comments")


async def start_worker():
    await asyncio.sleep(3)
    await _catch_up_unreviewed()
    backoff = 1
    while True:
        try:
            await consume_review(_handle_message)
            print("AI review worker: started")
            return
        except Exception as e:
            print(f"AI review worker: waiting for RabbitMQ... ({e})")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


async def stop_worker():
    await close_bus()
    print("AI review worker: stopped")
