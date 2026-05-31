"""FastAPI 应用入口"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from starlette.exceptions import HTTPException

from app.api.v1 import router as v1_router
from app.Config import settings
from app.infrastructure.Limiter import get_limiter
from app.infrastructure.Response import http_exception_handler
from app.scheduler.LifeSpan import lifespan

app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.state.limiter = get_limiter()
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://elves.elarion.cn"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(HTTPException, http_exception_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    msg = "；".join(e["msg"] for e in exc.errors())
    return JSONResponse(status_code=422, content={"code": 422, "message": msg, "data": None})

app.include_router(v1_router, prefix="/api/v1")
