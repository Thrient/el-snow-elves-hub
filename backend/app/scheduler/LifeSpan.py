"""应用生命周期 — 启动 / 关闭定时任务 + AI 审核 Worker + SSE 订阅"""
import asyncio
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from app.infrastructure.sse.PresenceTracker import subscribe
from app.scheduler.Cleanup import daily_cleanup, daily_fingerprint_cleanup
from app.scheduler.ReviewWorker import start_worker, stop_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_cleanup, "cron", hour=0, minute=0)
    scheduler.add_job(daily_fingerprint_cleanup, "cron", hour=3, minute=0)
    scheduler.start()

    await start_worker()

    sub_task = asyncio.create_task(subscribe())

    try:
        yield
    finally:
        sub_task.cancel()
        try:
            await sub_task
        except asyncio.CancelledError:
            pass
        await stop_worker()
        scheduler.shutdown()
