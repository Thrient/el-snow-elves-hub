"""AI Vision — 截图 → DeepSeek 视觉推理 → 返回文本"""
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
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
    return _client


@router.post("/ai/vision")
async def ai_vision(
    image: str = Body(...),
    prompt: str = Body(""),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("ai:vision")),
):
    """接收截图 + 提示词，调用 DeepSeek 视觉模型返回识别结果。"""

    # DeepSeek 用顶层 image_data / image_url 字段，不是 OpenAI 的 content 数组格式
    msg: dict = {"role": "user", "content": prompt}
    if image.startswith("data:"):
        # data:image/jpeg;base64,xxx → 纯 base64
        msg["image_data"] = image.split(",", 1)[1] if "," in image else image
    elif image.startswith("http://") or image.startswith("https://"):
        msg["image_url"] = image
    else:
        msg["image_data"] = image  # 假定已是纯 base64

    messages = [msg]

    try:
        completion = await _get_client().chat.completions.create(
            model=settings.deepseek_model,
            messages=messages,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
        )
    except Exception as e:
        raise BusinessException(f"AI 服务不可用: {str(e)[:200]}", 502)

    reply = completion.choices[0].message.content
    await log_audit(user, "AI视觉分析", "ai", None, prompt[:200], "")
    return ok({"reply": reply})
