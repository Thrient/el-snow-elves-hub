"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.response import http_exception_handler


async def _daily_cleanup():
    try:
        from app.core.database import async_session
        from app.api.v1.uploads import _cleanup_expired
        async with async_session() as db:
            count = await _cleanup_expired(db)
            if count:
                print(f"[定时清理] 清理了 {count} 个过期上传")
    except Exception as e:
        print(f"[定时清理] 失败: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_daily_cleanup, "cron", hour=0, minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://192.168.3.21:5173",
        "https://192.168.3.21:5173",
        "https://nas.elarion.cn:5173",
        "https://hub.elarion.cn:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


app.add_exception_handler(HTTPException, http_exception_handler)

# 注册路由
from app.api.v1 import router as v1_router

app.include_router(v1_router, prefix="/api/v1")
