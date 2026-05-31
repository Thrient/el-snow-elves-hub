"""应用生命周期 — 启动 / 关闭定时任务 + AI 审核 Worker"""
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from app.scheduler.Cleanup import daily_cleanup, daily_fingerprint_cleanup
from app.scheduler.ReviewWorker import start_worker, stop_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_cleanup, "cron", hour=0, minute=0)
    scheduler.add_job(daily_fingerprint_cleanup, "cron", hour=3, minute=0)
    scheduler.start()

    await start_worker()

    yield

    await stop_worker()
    scheduler.shutdown()
