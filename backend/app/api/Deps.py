"""FastAPI 依赖注入：当前用户、权限校验"""

from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.infrastructure.security.Token import decode_access_token
from app.identity.entity.User import User

_anon_perms: set[str] | None = None


async def _get_anon_perms(db: AsyncSession) -> set[str]:
    global _anon_perms
    if _anon_perms is not None:
        return _anon_perms
    from app.infrastructure.rbac.entity.Role import Role
    anon = (await db.execute(
        select(Role).where(Role.name == "anonymous")
    )).scalar_one_or_none()
    perms: set[str] = set()
    if anon and anon.permissions:
        perms = {p.code for p in anon.permissions}
    _anon_perms = perms
    return perms


def clear_anon_perm_cache():
    global _anon_perms
    _anon_perms = None


def _read_token(request: Request) -> str | None:
    """从 httpOnly Cookie 读取 access_token。"""
    return request.cookies.get("access_token")


async def _user_from_token(token: str | None, db: AsyncSession) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == int(user_id)))
    return result.scalar_one_or_none()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = _read_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")
    user = await _user_from_token(token, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或过期的令牌")
    return user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    token = _read_token(request)
    return await _user_from_token(token, db)


def require_perm(perm: str) -> Callable:
    """权限码校验依赖工厂"""

    async def checker(user: User = Depends(get_current_user)) -> User:
        if not user.has_permission(perm):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要权限: {perm}",
            )
        return user

    return checker


async def get_data_scope(user: User | None) -> str:
    """获取用户有效数据范围 — 多角色取最宽松值"""
    if not user:
        return "self"
    for role in user.roles:
        if role.data_scope == "all":
            return "all"
    return "self"


async def require_owner(resource, user: User, owner_attr: str = "author_id"):
    """所有权校验：scope=self 时只能操作自己的资源；scope=all 的管理员跳过"""
    scope = await get_data_scope(user)
    if scope == "self" and getattr(resource, owner_attr) != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="只能操作自己的资源")


async def require_verified(user: User = Depends(get_current_user)):
    """未验证邮箱的用户禁止写操作"""
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="请先验证邮箱")


def require_perm_any(perm: str) -> Callable:
    """权限校验（含匿名角色）：未登录用户检查匿名角色权限，已登录检查全部角色"""

    async def checker(
        user: User | None = Depends(get_optional_user),
        db: AsyncSession = Depends(get_db),
    ) -> User | None:
        if user and user.has_permission(perm):
            return user
        if perm in await _get_anon_perms(db):
            return user
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="需要登录")
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"需要权限: {perm}")

    return checker
