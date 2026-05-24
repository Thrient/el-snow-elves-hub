"""认证路由 — 注册 / 登录 / Token刷新 / 当前用户"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password
from app.core.deps import get_current_user, require_perm_any
from app.config import settings
from app.core.limiter import get_limiter
from app.models.user import User, MAX_FAILED_LOGINS, LOCKOUT_DURATION
from app.models.rbac import Role, UserRole
from app.schemas.user import (
    RefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["认证"])
_limiter = get_limiter()


def _make_tokens(user: User) -> TokenResponse:
    sub = str(user.id)
    return TokenResponse(
        access_token=create_access_token({"sub": sub}),
        refresh_token=create_refresh_token({"sub": sub}, user.token_version),
        user=UserResponse.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@_limiter.limit(settings.rate_limit_auth)
async def register(request: Request, body: UserRegister, db: AsyncSession = Depends(get_db), _=Depends(require_perm_any("auth:register"))):
    """邮箱注册"""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册")

    existing_name = await db.execute(select(User).where(User.username == body.username))
    if existing_name.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户名已被使用")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    # 注册时自动获得匿名权限 + 普通用户权限（两层不重复）
    roles = (await db.execute(
        select(Role).where(Role.name.in_(["anonymous", "user"]))
    )).scalars().all()
    for role in roles:
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return _make_tokens(user)


@router.post("/login", response_model=TokenResponse)
@_limiter.limit(settings.rate_limit_auth)
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db), _=Depends(require_perm_any("auth:login"))):
    """邮箱登录（5次失败锁定15分钟）"""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    # 账号锁定检查
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"账号已锁定，请 {remaining // 60} 分钟后重试",
        )

    # 账号禁用检查
    if user.is_disabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用，请联系管理员")

    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_LOGINS:
            user.locked_until = datetime.now(timezone.utc) + LOCKOUT_DURATION
            user.failed_login_attempts = 0
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"连续 {MAX_FAILED_LOGINS} 次登录失败，账号已锁定 15 分钟",
            )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    # 登录成功，重置计数器
    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        await db.commit()

    return _make_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
@_limiter.limit(settings.rate_limit_auth)
async def refresh_token(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db), _=Depends(require_perm_any("auth:refresh"))):
    """用 refresh_token 换取新 access_token（旧 token 立即失效）"""
    payload = decode_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token 无效或已过期")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token 数据缺失")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    # Token 版本校验：旧 token 版本号不匹配则拒绝
    token_ver = payload.get("ver")
    if token_ver is None or token_ver != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token 已被使用，请重新登录")

    # 轮换：递增版本号，旧 token 立即失效
    user.token_version += 1
    await db.commit()
    await db.refresh(user)

    return _make_tokens(user)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user), _=Depends(require_perm_any("user:profile"))):
    """获取当前登录用户"""
    return UserResponse.model_validate(user)


@router.put("/me", response_model=UserResponse)
async def update_me(body: UserUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db), _=Depends(require_perm_any("user:profile"))):
    """更新当前用户信息"""
    if body.username is not None:
        user.username = body.username
    if body.avatar is not None:
        user.avatar = body.avatar
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
