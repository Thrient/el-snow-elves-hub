"""统一 SSE 端点 — GET /api/v1/stream?client=web|desktop"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.Deps import get_optional_user, require_perm_any
from app.identity.entity.User import User
from app.infrastructure.sse.PresenceTracker import (
    add as presence_add, remove as presence_remove,
    heartbeat as presence_heartbeat, ANONYMOUS_USER_ID,
)

router = APIRouter(tags=["在线状态"])


@router.get("/stream",
            dependencies=[Depends(require_perm_any("presence:stream"))])
async def stream(
    client: str = Query(..., pattern="^(web|desktop)$"),
    user: User | None = Depends(get_optional_user),
):
    import asyncio

    user_id = user.id if user else ANONYMOUS_USER_ID
    client_id, queue = await presence_add(client, user_id)

    async def generate():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    await presence_heartbeat(client_id)
        except asyncio.CancelledError:
            pass
        finally:
            await presence_remove(client_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
