"""AI Vision — 截图 → 豆包视觉推理 → 返回文本"""
from fastapi import APIRouter, Body, Depends

from app.Config import settings
from app.infrastructure.Response import ok, call_external
from app.api.Deps import get_optional_user, require_perm_any
from app.identity.entity.User import User
from app.audit.service import log_audit

router = APIRouter(tags=["AI"])


@router.post("/ai/vision")
async def ai_vision(
    image: str = Body(...),
    prompt: str = Body(""),
    user: User | None = Depends(get_optional_user),
    _=Depends(require_perm_any("ai:vision")),
):
    """接收截图 + 提示词，调用 Ollama 视觉模型返回识别结果。"""

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个游戏界面文字识别助手。"
                "禁止处理以下内容：色情、性暗示、裸体、性行为描写；"
                "政治敏感话题、颠覆国家政权、分裂国家、恐怖主义；"
                "暴力、血腥、虐待、自残；"
                "违法内容、诈骗、赌博、毒品。"
                "如果用户输入涉及以上内容，直接回复'无法处理该内容'并拒绝执行。"
            ),
        },
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": image}},
                {"type": "text", "text": prompt},
            ],
        },
    ]

    body = {
        "model": settings.ai_model,
        "messages": messages,
        "stream": False,
        "max_tokens": 4096,
        "temperature": 0,
    }

    resp = await call_external("POST", settings.ai_api_url, json=body)
    reply = resp.json()["choices"][0]["message"]["content"]
    await log_audit(user, "AI视觉分析", "ai", None, prompt[:200], "")
    return ok({"reply": reply})
