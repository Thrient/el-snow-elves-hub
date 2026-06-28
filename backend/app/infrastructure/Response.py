"""统一 API 响应格式"""

import logging

from fastapi.responses import JSONResponse
from fastapi import Request
from starlette.exceptions import HTTPException
from pydantic import BaseModel

_log = logging.getLogger("el-snow-hub.Response")


class BusinessException(Exception):
    """业务异常 — 统一由 exception handler 转换为 fail 响应"""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


class APIResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: object = None


def ok(data=None, message: str = "ok") -> dict:
    return {"code": 0, "message": message, "data": data}


def fail(code: int = -1, message: str = "error", data=None) -> dict:
    return {"code": code, "message": message, "data": data}


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": str(exc.detail), "data": None},
    )


async def business_exception_handler(request: Request, exc: BusinessException):
    return JSONResponse(
        status_code=exc.status_code,
        content=fail(exc.status_code, exc.message),
    )


async def general_exception_handler(request: Request, exc: Exception):
    _log.exception("未处理的异常")
    return JSONResponse(
        status_code=500,
        content=fail(500, "服务器内部错误"),
    )
