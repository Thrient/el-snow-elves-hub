"""AI 审核 Worker — 消费 RabbitMQ → llama.cpp 审核 → 直接写 DB"""
import asyncio
import base64
import json
import re

import httpx
from openai import AsyncOpenAI
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
from app.Config import settings

AI_EMAIL = "ai-reviewer@elarion.cn"

_ai_client: AsyncOpenAI | None = None


def _get_ai_client() -> AsyncOpenAI:
    global _ai_client
    if _ai_client is None:
        _ai_client = AsyncOpenAI(
            api_key=settings.dashscope_api_key,
            base_url=settings.dashscope_base_url,
        )
    return _ai_client

REVIEW_PROMPT = """检查以下内容是否包含明确的违规：
- 人身攻击/辱骂（含拼音缩写 sb/cnm/nmsl 等）
- 色情低俗内容
- 政治敏感内容

重要：只标记极其明确、证据充分的违规。描述自动化脚本、游戏辅助、茶馆说书等日常话题都是正常内容。

输出 JSON：{"action":"pass|pending|reject","reason":"原因"}

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


def _extract_json(text: str) -> dict | None:
    """从模型输出中提取 JSON 对象。支持：
    - 纯 JSON: {"action": "pass"}
    - Markdown 代码块: ```json\\n{...}\\n```
    - 前缀文本 + JSON: 一些文字...\\n{"action": "pass"}
    """
    if not text:
        return None
    # 尝试直接解析
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    # 提取 markdown ```json ... ``` 代码块
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # 提取最后一个 JSON 对象
    for m in re.finditer(r"\{[^{}]*\"action\"[^{}]*\}", text):
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            continue
    return None


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 llama.cpp 审查，返回 {"action": "pass"|"pending"|"reject"|None, "reason": str}"""
    prompt = REVIEW_PROMPT + text

    # 构建 messages — 纯文本或带图片
    if image_urls:
        image_b64s: list[str] = []
        async with httpx.AsyncClient(timeout=120) as cli:
            for url in image_urls:
                # _resolve_images 返回的是相对路径，需要拼完整 URL（容器内回环）
                full_url = f"http://localhost:8000{url}"
                try:
                    resp = await cli.get(full_url)
                    if resp.status_code == 200:
                        b64 = base64.b64encode(resp.content).decode()
                        image_b64s.append(b64)
                    else:
                        print(f"AI review: image download failed {full_url} HTTP {resp.status_code}")
                except Exception as e:
                    print(f"AI review: image download error {full_url}: {e}")
        if image_b64s:
            content_parts = [{"type": "text", "text": prompt}]
            for b64 in image_b64s:
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                })
            messages = [{"role": "user", "content": content_parts}]
        else:
            # 有图片 URL 但下载全失败 — 标记为待人工审核
            print(f"AI review: all {len(image_urls)} image(s) failed to download, flagging for manual review")
            return {"action": "pending", "reason": "图片无法下载，需要人工审核"}
    else:
        messages = [{"role": "user", "content": prompt}]

    last_error = None
    for attempt in range(3):
        try:
            completion = await _get_ai_client().chat.completions.create(
                model=settings.dashscope_model,
                messages=messages,
                max_tokens=32768,
            )
            raw = completion.choices[0].message.content or ""
            result = _extract_json(raw)
            if result is None:
                raise ValueError(f"无法解析 JSON: {raw[:200]}")
            action = result.get("action", "pass")
            reason = result.get("reason", "")
            if action not in ("pass", "pending", "reject"):
                action = "pending"
            if not reason:
                reason = "内容正常" if action == "pass" else "无法确定" if action == "pending" else "违规内容"
            return {"action": action, "reason": reason}
        except Exception as e:
            last_error = str(e)[:200]
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
        return [f"/api/v1/files/{r.fingerprint.sha256}" for r in recs]


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

    # 防重复：已有审核记录的直接跳过
    async with async_session() as db:
        existing = (await db.execute(
            select(ReviewRecord).where(
                ReviewRecord.content_type == type_,
                ReviewRecord.content_id == item_id,
            )
        )).scalar_one_or_none()
        if existing:
            print(f"AI review skipped (already reviewed): {type_} #{item_id}")
            return

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
    """一次性扫描：已发布但未审核的内容重新入队（跳过已有审核记录的内容）"""
    async with async_session() as db:
        # 获取所有已审核的内容 ID
        reviewed_posts = set()
        reviewed_tasks = set()
        reviewed_comments = set()
        records = (await db.execute(select(ReviewRecord))).scalars().all()
        for r in records:
            if r.content_type in ("post", "reply"):
                reviewed_posts.add(r.content_id)
            elif r.content_type == "task":
                reviewed_tasks.add(r.content_id)
            elif r.content_type == "comment":
                reviewed_comments.add(r.content_id)

        posts = (await db.execute(
            select(ForumPost).where(ForumPost.status == "published")
        )).scalars().all()
        new_posts = 0
        for p in posts:
            if p.id in reviewed_posts:
                continue
            kind = "post" if p.thread_id is None else "reply"
            await publish_review(kind, p.id)
            new_posts += 1

        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.status == "published")
        )).scalars().all()
        new_tasks = 0
        for t in tasks:
            if t.id in reviewed_tasks:
                continue
            await publish_review("task", t.id)
            new_tasks += 1

        comments = (await db.execute(
            select(Comment).where(Comment.status == "published")
        )).scalars().all()
        new_comments = 0
        for c in comments:
            if c.id in reviewed_comments:
                continue
            await publish_review("comment", c.id)
            new_comments += 1

    print(f"AI review catch-up: {new_posts}/{len(posts)} posts, {new_tasks}/{len(tasks)} tasks, {new_comments}/{len(comments)} comments")


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
