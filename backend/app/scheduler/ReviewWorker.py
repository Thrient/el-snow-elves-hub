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

AI_EMAIL = "ai-reviewer@elarion.cn"
OLLAMA_URL = "http://ollama:11434/api/generate"
MODEL = "minicpm-v:8b"

REVIEW_PROMPT = """同时审查文字和图片。必须给出明确判断，不得返回不确定。

拒绝条件（pass=false）：
1.色情/裸露：直接暴露生殖器、女性胸部、性行为、性暗示姿势、情趣内衣
2.人身攻击：辱骂、诅咒、威胁（含拼音缩写sb/cnm/nmsl等）
3.政治敏感：攻击国家/政府/领导人、分裂言论、敏感历史事件

reason字段要求：若拒绝，必须引用具体违规内容，例如"图片暴露女性胸部"、"文字含cnm辱骂"、"图片为生殖器特写"。若通过，写"内容正常"。必须JSON：{"pass":true|false,"reason":"具体引用"}

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
    """调 Ollama 审查，返回 {"pass": bool|None, "reason": str}"""
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
                passed = result.get("pass", result.get("action") == "pass")
                reason = result.get("reason", "")
                if not reason:
                    reason = "内容违规" if not passed else "内容正常"
                return {"pass": passed, "reason": reason}
        except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError):
            last_error = "network error"
        except Exception as e:
            last_error = str(e)[:100]
        if attempt < 2:
            await asyncio.sleep(2)
    # 3 次重试都失败
    print(f"AI review failed after 3 retries: {last_error}")
    return {"pass": None, "reason": last_error}


async def _resolve_images(image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    async with async_session() as db:
        recs = (await db.execute(
            select(FileRecord).where(FileRecord.id.in_(image_ids))
        )).scalars().all()
        return [storage_service.url(r.fingerprint) for r in recs]


async def _handle_message(data: dict):
    """处理单条审核消息 — 直接 INSERT ReviewRecord + UPDATE content.status"""
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
        images = await _resolve_images(image_ids)
        result = await ai_review_text(text, images)
        if result["pass"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        passed = result["pass"]
        print(f"AI {'passed' if passed else 'rejected'} {type_} #{item_id}: {result['reason']}")

        async with async_session() as db:
            if passed:
                db.add(ReviewRecord(
                    content_type=type_, content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            else:
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
        images = await _resolve_images([cover_id] if cover_id else [])
        result = await ai_review_text(text, images)
        if result["pass"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        passed = result["pass"]
        print(f"AI {'passed' if passed else 'rejected'} task #{item_id}: {result['reason']}")

        async with async_session() as db:
            if passed:
                db.add(ReviewRecord(
                    content_type="task", content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            else:
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
        result = await ai_review_text(text)
        if result["pass"] is None:
            raise RuntimeError(f"AI unavailable for {type_} #{item_id} after retries")
        passed = result["pass"]
        print(f"AI {'passed' if passed else 'rejected'} comment #{item_id}: {result['reason']}")

        async with async_session() as db:
            if passed:
                db.add(ReviewRecord(
                    content_type="comment", content_id=item_id,
                    reviewer_id=ai_user_id, status="approved",
                    reason=result["reason"],
                ))
            else:
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
        # 帖子 + 回复
        posts = (await db.execute(
            select(ForumPost).where(ForumPost.status == "published")
        )).scalars().all()
        for p in posts:
            kind = "post" if p.thread_id is None else "reply"
            await publish_review(kind, p.id)
        # 任务
        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.status == "published")
        )).scalars().all()
        for t in tasks:
            await publish_review("task", t.id)
        # 评论
        comments = (await db.execute(
            select(Comment).where(Comment.status == "published")
        )).scalars().all()
        for c in comments:
            await publish_review("comment", c.id)
    print(f"AI review catch-up: {len(posts)} posts, {len(tasks)} tasks, {len(comments)} comments")


async def start_worker():
    await asyncio.sleep(3)  # 等待 HTTP server 就绪
    await _catch_up_unreviewed()  # 兜底扫描漏审内容

    # RabbitMQ 容器可能还在启动，无限重试直到连上
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
