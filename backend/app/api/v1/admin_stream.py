"""管理后台 SSE 推送"""
import asyncio
import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.deps import require_perm
from app.core.online_tracker import admin_queues_list, counts, _lock as tracker_lock

router = APIRouter(
    prefix="/admin",
    tags=["管理SSE"],
    dependencies=[Depends(require_perm("admin:access"))],
)


@router.get("/stream")
async def admin_stream():
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
