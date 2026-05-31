"""AI 内容审核 — Ollama 文字+视觉双审"""
import json
import logging

import httpx
from sqlalchemy import select

from app.infrastructure.Database import async_session
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.FileRecord import FileRecord

logger = logging.getLogger("scheduler.ai_review")

OLLAMA_URL = "http://192.168.3.21:11434/api/chat"
MODEL = "minicpm-v:8b"

REVIEW_PROMPT = """你是一个内容审核助手。请审查以下内容是否包含违规信息：
- 色情、低俗内容
- 暴力、恐怖内容
- 政治敏感内容
- 广告、垃圾信息
- 人身攻击、辱骂

回复 JSON: {"pass": true/false, "reason": "简短说明原因"}

待审查内容：
"""


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 Ollama 审查，返回 {"pass": bool, "reason": str}"""
    messages = [{"role": "user", "content": REVIEW_PROMPT + text}]

    # 图片 URL 转 base64 传给视觉模型
    if image_urls:
        images = []
        async with httpx.AsyncClient(timeout=30) as cli:
            for url in image_urls:
                try:
                    resp = await cli.get(url)
                    if resp.status_code == 200:
                        import base64
                        b64 = base64.b64encode(resp.content).decode()
                        images.append({"type": "image_url", "image_url": {"url": f"data:image;base64,{b64}"}})
                except Exception:
                    pass

        if images:
            content_parts = [{"type": "text", "text": REVIEW_PROMPT + text}] + images
            messages = [{"role": "user", "content": content_parts}]

    try:
        async with httpx.AsyncClient(timeout=120) as cli:
            resp = await cli.post(OLLAMA_URL, json={
                "model": MODEL,
                "messages": messages,
                "stream": False,
                "format": "json",
            })
            data = resp.json()
            result = json.loads(data["message"]["content"])
            return {"pass": result.get("pass", True), "reason": result.get("reason", "")}
    except Exception as e:
        logger.warning(f"AI review failed: {e}")
        return {"pass": True, "reason": ""}  # AI 不可用时放行，让人工审


async def _resolve_images(image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    async with async_session() as db:
        recs = (await db.execute(
            select(FileRecord).where(FileRecord.id.in_(image_ids))
        )).scalars().all()
        return [storage_service.url(r.fingerprint) for r in recs]


async def run_ai_review():
    """定时任务：审查所有未审核内容"""
    logger.info("AI review: starting")

    async with async_session() as db:
        # ── 1. 帖子 ──
        posts = (await db.execute(
            select(ForumPost).where(
                ForumPost.reviewed == False,
                ForumPost.thread_id.is_(None),  # 只审主帖
            ).limit(10)
        )).scalars().all()

        for p in posts:
            images = await _resolve_images(p.image_ids)
            result = await ai_review_text(p.title or "" + "\n" + p.content, images)
            if result["pass"]:
                p.reviewed = True
            else:
                p.status = "rejected"
                p.reviewed = True
                logger.info(f"AI rejected post #{p.id}: {result['reason']}")
            await db.commit()

        # ── 2. 评论（回复）─
        replies = (await db.execute(
            select(ForumPost).where(
                ForumPost.reviewed == False,
                ForumPost.thread_id.isnot(None),
            ).limit(20)
        )).scalars().all()

        for r in replies:
            images = await _resolve_images(r.image_ids)
            result = await ai_review_text(r.content, images)
            if result["pass"]:
                r.reviewed = True
            else:
                r.status = "rejected"
                r.reviewed = True
                logger.info(f"AI rejected reply #{r.id}: {result['reason']}")
            await db.commit()

        # ── 3. 任务 ──
        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.reviewed == False).limit(10)
        )).scalars().all()

        for t in tasks:
            text = f"{t.title}\n{t.description or ''}"
            cover_urls = [storage_service.url(t.cover_record.fingerprint)] if t.cover_record else None
            result = await ai_review_text(text, cover_urls)
            if result["pass"]:
                t.reviewed = True
            else:
                t.reviewed = True
                logger.info(f"AI reviewed task #{t.id}: {result['reason']}")
            await db.commit()

        # ── 4. 任务评论 ──
        task_comments = (await db.execute(
            select(Comment).where(Comment.reviewed == False).limit(20)
        )).scalars().all()

        for c in task_comments:
            result = await ai_review_text(c.content)
            if result["pass"]:
                c.reviewed = True
            else:
                c.status = "rejected"
                c.reviewed = True
                logger.info(f"AI rejected comment #{c.id}: {result['reason']}")
            await db.commit()

    logger.info("AI review: done")
