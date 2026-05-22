"""管理后台 SSE 推送"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.core.online_tracker import admin_queues_list, counts, _lock as tracker_lock
from app.models.user import User

router = APIRouter(
    prefix="/admin",
    tags=["管理SSE"],
)

security = HTTPBearer(auto_error=False)


async def get_user_from_query_or_header(
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via ?token= query param (for EventSource) or Bearer header."""
    jwt = None
    if credentials:
        jwt = credentials.credentials
    elif token:
        jwt = token

    if not jwt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要登录")

    payload = decode_access_token(jwt)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或过期的令牌")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌格式错误")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    if not user.has_permission("admin:access"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要权限: admin:access")

    return user


@router.get("/stream")
async def admin_stream(user: User = Depends(get_user_from_query_or_header)):
    """管理员 SSE 连接，接收在线数等实时指标。"""
    q: asyncio.Queue = asyncio.Queue()
    admin_queues_list().append(q)

    # 首次推送当前在线数
    async with tracker_lock:
        initial = json.dumps({"type": "online_count", **counts()})
    await q.put(initial)

    async def generate():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            admin_queues_list().remove(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
