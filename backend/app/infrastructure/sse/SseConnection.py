"""SSE 连接管理 — 队列创建/注册/初始推送/心跳/清理，各域共用"""
from __future__ import annotations
import asyncio

from fastapi.responses import StreamingResponse


class SseConnection:
    """管理一个 SSE 连接的生命周期。各域创建实例 → 注册队列 → 返回 stream response。"""

    def __init__(self, queue: asyncio.Queue, on_disconnect: callable):
        self._queue = queue
        self._on_disconnect = on_disconnect

    async def push(self, data: str):
        """向客户端推送消息"""
        await self._queue.put(data)

    def stream(self, heartbeat_seconds: float = 30.0) -> StreamingResponse:
        """返回 StreamingResponse，内部处理心跳和断连清理"""

        async def generate():
            try:
                while True:
                    try:
                        data = await asyncio.wait_for(
                            self._queue.get(), timeout=heartbeat_seconds
                        )
                        yield f"data: {data}\n\n"
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
            except asyncio.CancelledError:
                pass
            finally:
                self._on_disconnect()

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
