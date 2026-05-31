"""应用生命周期 — 启动 / 关闭定时任务"""
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from app.scheduler.Cleanup import daily_cleanup, daily_fingerprint_cleanup
from app.scheduler.AiReview import run_ai_review


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_cleanup, "cron", hour=0, minute=0)
    scheduler.add_job(daily_fingerprint_cleanup, "cron", hour=3, minute=0)
    scheduler.add_job(run_ai_review, "interval", minutes=5)
    scheduler.start()
    yield
    scheduler.shutdown()
