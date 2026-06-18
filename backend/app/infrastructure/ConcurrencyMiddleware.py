"""并发限流中间件 — 集中配置，按路由限制并行请求数"""
import asyncio

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse

_concurrency: dict[str, int] = {
    "/api/v1/ai/vision": 2,
}


class ConcurrencyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._semaphores: dict[str, asyncio.BoundedSemaphore] = {}

    def _get_sem(self, path: str, limit: int) -> asyncio.BoundedSemaphore:
        if path not in self._semaphores:
            self._semaphores[path] = asyncio.BoundedSemaphore(limit)
        return self._semaphores[path]

    async def dispatch(self, request, call_next):
        limit = _concurrency.get(request.url.path)
        if limit is None:
            return await call_next(request)

        sem = self._get_sem(request.url.path, limit)
        try:
            await asyncio.wait_for(sem.acquire(), timeout=0.01)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=429,
                content={"code": 429, "message": "服务繁忙，请稍后重试", "data": None},
            )
        try:
            return await call_next(request)
        finally:
            sem.release()
