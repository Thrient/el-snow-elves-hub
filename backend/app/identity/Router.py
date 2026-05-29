"""用户身份 — 注册 / 登录 / Token 刷新 / 个人中心 / 头像上传"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.infrastructure.security.Token import (
    create_access_token, create_refresh_token, decode_refresh_token,
    hash_password, verify_password,
)
from app.api.Deps import get_current_user, require_perm_any
from app.infrastructure.Limiter import get_limiter
from app.Config import settings
from app.identity.entity.User import User, MAX_FAILED_LOGINS, LOCKOUT_DURATION
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.UserRole import UserRole
from app.task.entity.Task import Task as TaskModel
from app.task.entity.TaskLike import TaskLike
from app.task.entity.DownloadRecord import DownloadRecord
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.FileValidator import validate_file_size, validate_image

router = APIRouter(tags=["认证 / 用户"])
_limiter = get_limiter()


# ── Schemas ──

from app.identity.Schema.UserRegister import UserRegister
from app.identity.Schema.UserLogin import UserLogin
from app.identity.Schema.UserResponse import UserResponse
from app.identity.Schema.TokenResponse import TokenResponse
from app.identity.Schema.RefreshRequest import RefreshRequest
from app.identity.Schema.UserUpdate import UserUpdate
from app.identity.Schema.DownloadItem import DownloadItem
from app.identity.Schema.LikeItem import LikeItem


def _make_tokens(user: User) -> TokenResponse:
    sub = str(user.id)
    return TokenResponse(
        access_token=create_access_token({"sub": sub}),
        refresh_token=create_refresh_token({"sub": sub}, user.token_version),
        user=UserResponse.model_validate(user),
    )


# ── Auth ──

@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@_limiter.limit(settings.rate_limit_auth)
async def register(
    request: Request, body: UserRegister, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:register")),
):
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册")
    if (await db.execute(select(User).where(User.username == body.username))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户名已被使用")

    user = User(username=body.username, email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    await db.flush()

    roles = (await db.execute(select(Role).where(Role.name.in_(["anonymous", "user"])))).scalars().all()
    for role in roles:
        db.add(UserRole(user_id=user.id, role_id=role.id))

    await db.commit()
    await db.refresh(user)
    return _make_tokens(user)


@router.post("/auth/login", response_model=TokenResponse)
@_limiter.limit(settings.rate_limit_auth)
async def login(
    request: Request, body: UserLogin, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:login")),
):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=f"账号已锁定，请 {remaining // 60} 分钟后重试")

    if user.is_disabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用，请联系管理员")

    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_LOGINS:
            user.locked_until = datetime.now(timezone.utc) + LOCKOUT_DURATION
            user.failed_login_attempts = 0
            await db.commit()
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=f"连续 {MAX_FAILED_LOGINS} 次登录失败，账号已锁定 15 分钟")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        await db.commit()

    return _make_tokens(user)


@router.post("/auth/refresh", response_model=TokenResponse)
@_limiter.limit(settings.rate_limit_auth)
async def refresh_token(
    request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:refresh")),
):
    payload = decode_refresh_token(body.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token 无效或已过期")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token 数据缺失")

    user = (await db.execute(select(User).where(User.id == int(user_id)))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    token_ver = payload.get("ver")
    if token_ver is None or token_ver != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh_token 已被使用，请重新登录")

    user.token_version += 1
    await db.commit()
    await db.refresh(user)
    return _make_tokens(user)


@router.get("/auth/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    _=Depends(require_perm_any("user:profile")),
):
    return UserResponse.model_validate(user)


@router.put("/auth/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:profile")),
):
    if body.username is not None:
        user.username = body.username
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


# ── Users ──

@router.get("/users/me/downloads")
async def my_downloads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:profile")),
):
    result = await db.execute(
        select(DownloadRecord).where(DownloadRecord.user_id == user.id)
        .order_by(desc(DownloadRecord.downloaded_at)).limit(50)
    )
    items = []
    for r in result.scalars().all():
        task = (await db.execute(select(TaskModel).where(TaskModel.id == r.task_id))).scalar_one_or_none()
        items.append(DownloadItem(
            task_id=r.task_id, task_title=task.title if task else "", downloaded_at=r.downloaded_at,
        ))
    return {"code": 0, "message": "ok", "data": items}


@router.get("/users/me/likes")
async def my_likes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:profile")),
):
    result = await db.execute(
        select(TaskLike).where(TaskLike.user_id == user.id)
        .order_by(desc(TaskLike.created_at)).limit(50)
    )
    items = []
    for r in result.scalars().all():
        task = (await db.execute(select(TaskModel).where(TaskModel.id == r.task_id))).scalar_one_or_none()
        items.append(LikeItem(
            task_id=r.task_id, task_title=task.title if task else "", created_at=r.created_at,
        ))
    return {"code": 0, "message": "ok", "data": items}


@router.post("/users/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:profile")),
):
    validate_file_size(file)
    data = await file.read()
    validate_image(data)
    fp = await storage_service.store(db, data, file.content_type or "image/png")
    await db.flush()
    record = await storage_service.create_record(
        db, fp, filename=file.filename or "avatar.png",
        content_type=file.content_type or "image/png", uploaded_by=user.id,
    )
    user.avatar_record_id = record.id
    await db.commit()
    await db.refresh(user)
    return {"code": 0, "message": "ok", "data": {"avatar_url": storage_service.url(fp)}}
