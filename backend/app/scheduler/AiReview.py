"""AI 内容审核 — Ollama 文字+视觉双审"""
import json

import httpx
from sqlalchemy import select

from app.infrastructure.Database import async_session
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.FileRecord import FileRecord

OLLAMA_URL = "http://ollama:11434/api/chat"
MODEL = "minicpm-v:8b"

REVIEW_PROMPT = """你是一个内容审核助手。审查以下内容是否违规（色情/暴力/政治敏感/广告/辱骂）。
严格按此 JSON 格式回复，不要修改 key 名：
{"pass": true, "reason": "简短说明"}
pass=true 表示通过（无违规），pass=false 表示违规。

内容：\n"""


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 Ollama 审查，返回 {"pass": bool, "reason": str}"""
    messages = [{"role": "user", "content": REVIEW_PROMPT + text}]

    # 图片 URL 转 base64 传给视觉模型
    if image_urls:
        images = []
        async with httpx.AsyncClient(timeout=120) as cli:
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
                "keep_alive": "10m",
            })
            data = resp.json()
            raw = data["message"]["content"]
            result = json.loads(raw)
            passed = result.get("pass", result.get("action") == "pass")
            return {"pass": passed, "reason": result.get("reason", "")}
    except Exception as e:
        raw_preview = ""
        try:
            raw_preview = data.get("message", {}).get("content", "")[:200]
        except Exception:
            pass
        print(f"AI review failed: {e} | raw: {raw_preview}")
        return {"pass": None, "reason": str(e)[:100]}


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
    print("AI review: starting")

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
            if result["pass"] is None:
                continue  # AI 不可用，跳过
            elif result["pass"]:
                p.reviewed = True
                print(f"AI passed post #{p.id}: {result['reason']}")
            else:
                p.status = "rejected"
                p.reviewed = True
                print(f"AI rejected post #{p.id}: {result['reason']}")
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
            if result["pass"] is None:
                continue
            elif result["pass"]:
                r.reviewed = True
                print(f"AI passed reply #{r.id}")
            else:
                r.status = "rejected"
                r.reviewed = True
                print(f"AI rejected reply #{r.id}: {result['reason']}")
            await db.commit()

        # ── 3. 任务 ──
        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.reviewed == False).limit(10)
        )).scalars().all()

        for t in tasks:
            text = f"{t.title}\n{t.description or ''}"
            cover_urls = [storage_service.url(t.cover_record.fingerprint)] if t.cover_record else None
            result = await ai_review_text(text, cover_urls)
            if result["pass"] is None:
                continue
            elif result["pass"]:
                t.reviewed = True
                print(f"AI passed task #{t.id}")
            else:
                t.reviewed = True
                print(f"AI reviewed task #{t.id}: {result['reason']}")
            await db.commit()

        # ── 4. 任务评论 ──
        task_comments = (await db.execute(
            select(Comment).where(Comment.reviewed == False).limit(20)
        )).scalars().all()

        for c in task_comments:
            result = await ai_review_text(c.content)
            if result["pass"] is None:
                continue
            elif result["pass"]:
                c.reviewed = True
                print(f"AI passed task comment #{c.id}")
            else:
                c.status = "rejected"
                c.reviewed = True
                print(f"AI rejected task comment #{c.id}: {result['reason']}")
            await db.commit()

    print("AI review: done")
