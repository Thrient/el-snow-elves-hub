"""全局限流器 — 惰性初始化，避免导入时循环依赖"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.Config import settings

_limiter: Limiter | None = None


def _create_limiter() -> Limiter:
    return Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit_default])


# 惰性：首次访问时创建。auth.py 等模块导入时不会触发。
_limiter = _create_limiter()


def get_limiter() -> Limiter:
    return _limiter
