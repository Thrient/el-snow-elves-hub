"""AI Vision — 截图 → 千问视觉推理 → 返回文本"""
from fastapi import APIRouter, Body, Depends
from openai import AsyncOpenAI

from app.Config import settings
from app.infrastructure.Response import ok, BusinessException
from app.api.Deps import get_optional_user, require_perm_any
from app.identity.entity.User import User
from app.audit.service import log_audit

router = APIRouter(tags=["AI"])

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.dashscope_api_key,
            base_url=settings.dashscope_base_url,
        )
    return _client


@router.post("/ai/vision")
async def ai_vision(
    image: str = Body(...),
    prompt: str = Body(""),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("ai:vision")),
):
    """接收截图 + 提示词，调用千问视觉模型返回识别结果。"""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image}},
                {"type": "text", "text": prompt},
            ],
        },
    ]

    try:
        completion = await _get_client().chat.completions.create(
            model=settings.dashscope_model,
            messages=messages,
        )
    except Exception as e:
        raise BusinessException(f"AI 服务不可用: {str(e)[:200]}", 502)

    reply = completion.choices[0].message.content
    await log_audit(user, "AI视觉分析", "ai", None, prompt[:200], "")
    return ok({"reply": reply})
