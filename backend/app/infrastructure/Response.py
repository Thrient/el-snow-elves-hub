"""统一 API 响应格式"""

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from fastapi import Request
from pydantic import BaseModel


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
