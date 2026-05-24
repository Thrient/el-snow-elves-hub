"""FastAPI 依赖注入：当前用户、权限校验"""

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或过期的令牌")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌格式错误")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


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


def require_perm_any(perm: str) -> Callable:
    """权限校验（含匿名角色）：未登录用户检查匿名角色权限，已登录检查全部角色"""

    async def checker(
        user: User | None = Depends(get_optional_user),
        db: AsyncSession = Depends(get_db),
    ) -> User | None:
        if user and user.has_permission(perm):
            return user
        # 未登录：查匿名角色
        from app.models.rbac import Role
        anon = (await db.execute(
            select(Role).where(Role.name == "anonymous")
        )).scalar_one_or_none()
        anon_perms: set[str] = set()
        if anon and anon.permissions:
            anon_perms = {p.code for p in anon.permissions}
        if perm in anon_perms:
            return user  # None for unauthenticated, User for authenticated
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="需要登录")
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"需要权限: {perm}")

    return checker
