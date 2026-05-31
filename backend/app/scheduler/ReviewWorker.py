"""AI 审核 Worker — 消费 RabbitMQ → Ollama 审核 → 调管理 API 提交结果"""
import asyncio
import json

import httpx
from sqlalchemy import select

from app.infrastructure.Database import async_session
from app.infrastructure.EventBus import consume_review
from app.infrastructure.security.Token import create_access_token
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.identity.entity.User import User

AI_EMAIL = "ai-reviewer@elarion.cn"
OLLAMA_URL = "http://ollama:11434/api/chat"
MODEL = "minicpm-v:8b"
API_BASE = "http://localhost:8000/api/v1"

REVIEW_PROMPT = """你是一个内容审核助手。审查以下内容是否有明确违规：
- 色情/低俗
- 暴力/恐怖
- 政治敏感
- 广告/垃圾
- 人身攻击/辱骂

规则：
- 有明显违规 → pass=false
- 正常内容/太短无法判断/无害闲聊 → pass=true
- 有疑问时倾向于通过（pass=true）

严格回复 JSON（不要修改 key 名）：
{"pass": true, "reason": "一句话原因"}

内容：\n"""

_ai_user_id: int | None = None


async def _get_ai_token() -> str:
    global _ai_user_id
    if _ai_user_id is None:
        async with async_session() as db:
            user = (await db.execute(
                select(User).where(User.email == AI_EMAIL)
            )).scalar_one_or_none()
            if not user:
                raise RuntimeError(f"AI 审核员不存在: {AI_EMAIL}")
            _ai_user_id = user.id
    return create_access_token({"sub": str(_ai_user_id), "email": AI_EMAIL})


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 Ollama 审查，返回 {"pass": bool|None, "reason": str}"""
    messages = [{"role": "user", "content": REVIEW_PROMPT + text}]

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
                "model": MODEL, "messages": messages,
                "stream": False, "format": "json", "keep_alive": "10m",
            })
            data = resp.json()
            raw = data["message"]["content"]
            result = json.loads(raw)
            passed = result.get("pass", result.get("action") == "pass")
            # 修正模型矛盾输出：reason 说无问题但 pass=false
            if not passed:
                r = result.get("reason", "").lower()
                if any(kw in r for kw in ["doesn't appear", "no explicit", "no clear",
                                            "does not appear", "does not contain",
                                            "cannot determine", "unable to determine",
                                            "不确定", "无法判断", "无明显", "未发现"]):
                    passed = True
            return {"pass": passed, "reason": result.get("reason", "")}
    except Exception as e:
        print(f"AI review failed: {e}")
        return {"pass": None, "reason": str(e)[:100]}


async def _resolve_images(image_ids: list | None) -> list[str]:
    if not image_ids:
        return []
    async with async_session() as db:
        recs = (await db.execute(
            select(FileRecord).where(FileRecord.id.in_(image_ids))
        )).scalars().all()
        return [storage_service.url(r.fingerprint) for r in recs]


async def _call_review_api(endpoint: str, body: dict, token: str):
    async with httpx.AsyncClient(timeout=30) as cli:
        resp = await cli.put(
            f"{API_BASE}{endpoint}", json=body,
            headers={"Cookie": f"access_token={token}"},
        )
        if resp.status_code != 200:
            print(f"  Review API {endpoint} failed: {resp.status_code} {resp.text}")


async def _handle_message(data: dict):
    """处理单条审核消息"""
    type_ = data["type"]
    item_id = data["id"]

    if type_ in ("post", "reply"):
        async with async_session() as db:
            p = (await db.execute(select(ForumPost).where(ForumPost.id == item_id))).scalar_one_or_none()
            if not p or p.reviewed:
                return
            text = (p.title or "") + "\n" + (p.content or "")
            image_ids = p.image_ids
        images = await _resolve_images(image_ids)
        result = await ai_review_text(text, images)
        if result["pass"] is None:
            return
        status = "approved" if result["pass"] else "rejected"
        print(f"AI {'passed' if result['pass'] else 'rejected'} {type_} #{item_id}: {result['reason']}")
        token = await _get_ai_token()
        await _call_review_api(
            f"/admin/posts/{item_id}/review",
            {"status": status, "reviewed": True, "reason": result["reason"]}, token)

    elif type_ == "task":
        async with async_session() as db:
            t = (await db.execute(select(TaskModel).where(TaskModel.id == item_id))).scalar_one_or_none()
            if not t or t.reviewed:
                return
            text = f"{t.title}\n{t.description or ''}"
        images = await _resolve_images([t.cover_record_id] if t.cover_record_id else [])
        result = await ai_review_text(text, images)
        if result["pass"] is None:
            return
        status = "approved" if result["pass"] else "rejected"
        print(f"AI {'passed' if result['pass'] else 'rejected'} task #{item_id}: {result['reason']}")
        token = await _get_ai_token()
        await _call_review_api(
            f"/admin/tasks/{item_id}/status",
            {"status": status, "reason": result["reason"]}, token)

    elif type_ == "comment":
        async with async_session() as db:
            c = (await db.execute(select(Comment).where(Comment.id == item_id))).scalar_one_or_none()
            if not c or c.reviewed:
                return
            text = c.content
        result = await ai_review_text(text)
        if result["pass"] is None:
            return
        status = "approved" if result["pass"] else "rejected"
        print(f"AI {'passed' if result['pass'] else 'rejected'} comment #{item_id}: {result['reason']}")
        token = await _get_ai_token()
        await _call_review_api(
            f"/admin/comments/{item_id}/review",
            {"status": status, "reviewed": True, "reason": result["reason"]}, token)


async def start_worker():
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
    from app.infrastructure.EventBus import close_bus
    await close_bus()
    print("AI review worker: stopped")
