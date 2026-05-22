"""桌面客户端 SSE 长连接"""
import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.online_tracker import connect as online_connect, disconnect as online_disconnect

router = APIRouter(prefix="/client", tags=["客户端"])


@router.get("/stream")
async def client_stream():
    """桌面客户端 SSE 连接。"""
    client_id, q = await online_connect("desktop")

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
            await online_disconnect("desktop", client_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
