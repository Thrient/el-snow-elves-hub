"""用户身份 — 注册 / 登录 / Token 刷新 / 个人中心 / 头像上传"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Form, status
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from el_token import ElUtil, ElSettings as ElTokenSettings

from app.infrastructure.security.Token import (
    create_verify_token, decode_verify_token,
    hash_password, verify_password,
)
from app.infrastructure.Mail import send_email
from app.infrastructure.Response import ok
from app.api.Deps import get_current_user, require_perm_any
from app.infrastructure.Limiter import get_limiter
from app.Config import settings
from app.identity.entity.User import User

MAX_FAILED_LOGINS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.UserRole import UserRole
from app.task.entity.Task import Task as TaskModel
from app.task.entity.TaskLike import TaskLike
from app.task.entity.DownloadRecord import DownloadRecord
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord

router = APIRouter(tags=["认证 / 用户"])
_limiter = get_limiter()


# ── Schemas ──

from app.identity.Schema.UserRegister import UserRegister
from app.identity.Schema.UserLogin import UserLogin
from app.identity.Schema.UserResponse import UserResponse
from app.identity.Schema.UserUpdate import UserUpdate
from app.identity.Schema.SendVerification import SendVerification
from app.identity.Schema.DownloadItem import DownloadItem
from app.identity.Schema.LikeItem import LikeItem


def _record_fail(r, fails_key: str, lock_key: str):
    tries = r.incr(fails_key)
    r.expire(fails_key, 900)
    if tries >= MAX_FAILED_LOGINS:
        r.delete(fails_key)
        r.setex(lock_key, int(LOCKOUT_DURATION.total_seconds()), "1")


def _set_auth_cookie(response: JSONResponse, token: str) -> JSONResponse:
    el_st = ElTokenSettings()
    domain = el_st.cookie_domain or None
    response.set_cookie(el_st.token_name, token, httponly=el_st.cookie_http_only,
                        secure=el_st.cookie_secure, samesite=el_st.cookie_same_site,
                        max_age=el_st.token_ttl, domain=domain, path="/")
    return response


def _clear_auth_cookie(response: JSONResponse) -> JSONResponse:
    el_st = ElTokenSettings()
    response.delete_cookie(el_st.token_name, domain=el_st.cookie_domain or None, path="/")
    return response


# ── Auth ──

@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
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
    token = create_verify_token(user.id)
    await send_email(user.email, "验证你的 Elves 账号",
        f"点击链接验证邮箱：https://elves.elarion.cn/api/v1/auth/verify-email?token={token}\n链接 1 小时内有效。")
    return ok(None, "注册成功，请查收验证邮件完成验证")


@router.post("/auth/login")
@_limiter.limit(settings.rate_limit_auth)
async def login(
    request: Request, body: UserLogin, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:login")),
):
    from app.infrastructure.Redis import get_redis
    r = get_redis()
    lock_key = f"login:lock:{body.email}"
    fails_key = f"login:fails:{body.email}"

    if r.exists(lock_key):
        ttl = r.ttl(lock_key)
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail=f"账号已锁定，请 {max(1, ttl // 60)} 分钟后重试")

    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user:
        _record_fail(r, fails_key, lock_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    if user.is_disabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用，请联系管理员")

    if not verify_password(body.password, user.password_hash):
        _record_fail(r, fails_key, lock_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    r.delete(fails_key, lock_key)

    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="请先验证邮箱后再登录")

    token = ElUtil.login(str(user.id), device="web")
    return _set_auth_cookie(
        JSONResponse(content={"code": 0, "data": UserResponse.model_validate(user).model_dump(mode="json")}),
        token,
    )


@router.post("/auth/logout")
async def logout(request: Request):
    ElUtil.logout()
    return _clear_auth_cookie(JSONResponse(content={"code": 0, "data": None}))


@router.get("/auth/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    _=Depends(require_perm_any("user:view")),
):
    return UserResponse.model_validate(user)


@router.put("/auth/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:update")),
):
    if body.username is not None:
        user.username = body.username
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/auth/me/email")
async def update_email(
    body: SendVerification, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:email")),
):
    if (await db.execute(select(User).where(User.email == body.email, User.id != user.id))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被使用")
    user.email = body.email
    user.email_verified = False
    await db.commit()
    token = create_verify_token(user.id)
    await send_email(user.email, "验证你的 Elves 账号",
        f"点击链接验证新邮箱：https://elves.elarion.cn/api/v1/auth/verify-email?token={token}\n链接 1 小时内有效。")
    return ok(None, "验证邮件已发送到新邮箱")


@router.get("/auth/verify-email", response_class=HTMLResponse)
async def verify_email(
    token: str = Query(...), db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:verify")),
):
    payload = decode_verify_token(token)
    if not payload:
        return _verify_page("验证失败", "链接无效或已过期")
    user_id = payload.get("sub")
    user = (await db.execute(select(User).where(User.id == int(user_id)))).scalar_one_or_none()
    if not user:
        return _verify_page("验证失败", "用户不存在")
    if user.email_verified:
        return _verify_page("已验证", "邮箱已通过验证，无需重复操作")
    user.email_verified = True
    await db.commit()
    return _verify_page("验证成功", "你的邮箱已通过验证，现在可以关闭此页面")


def _verify_page(title: str, msg: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · 时雪</title>
<style>
body{{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#faf8f5}}
@keyframes fadeUp{{from{{opacity:0;transform:translateY(16px)}}to{{opacity:1;transform:translateY(0)}}}}
.card{{animation:fadeUp .5s ease-out;text-align:center;padding:48px 56px;border-radius:16px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.06)}}
h1{{margin:0 0 12px;font-size:24px;color:#3d3630}}p{{margin:0;font-size:14px;color:#9e9488}}
.icon{{display:block;width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:#52c41a;position:relative}}
.icon::after{{content:'';position:absolute;left:18px;top:14px;width:12px;height:24px;border:solid #fff;border-width:0 3px 3px 0;transform:rotate(45deg)}}
</style></head>
<body><div class="card"><div class="icon"></div><h1>{title}</h1><p>{msg}</p></div></body></html>"""


@router.post("/auth/send-verification")
@_limiter.limit(settings.rate_limit_auth)
async def send_verification(
    request: Request, body: SendVerification, db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("auth:send-verify")),
):
    user = (await db.execute(
        select(User).where(User.email == body.email, User.email_verified == False)
    )).scalar_one_or_none()
    if user:
        token = create_verify_token(user.id)
        await send_email(user.email, "验证你的 Elves 账号",
            f"点击链接验证邮箱：https://elves.elarion.cn/api/v1/auth/verify-email?token={token}\n链接 1 小时内有效。")
    return ok(None, "如果该邮箱已注册且未验证，验证邮件已重新发送")


@router.post("/auth/resend-verification")
async def resend_verification(
    user: User = Depends(get_current_user),
    _=Depends(require_perm_any("auth:resend-verify")),
):
    if user.email_verified:
        return ok(None, "邮箱已验证")
    token = create_verify_token(user.id)
    await send_email(user.email, "验证你的时雪账号",
        f"点击链接验证邮箱：https://elves.elarion.cn/api/v1/auth/verify-email?token={token}\n链接 1 小时内有效。")
    return ok(None, "验证邮件已重新发送")


# ── Users ──

@router.get("/users/me/downloads")
async def my_downloads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:downloads")),
):
    result = await db.execute(
        select(DownloadRecord).where(DownloadRecord.user_id == user.id)
        .order_by(desc(DownloadRecord.downloaded_at)).limit(50)
    )
    records = list(result.scalars().all())
    task_ids = {r.task_id for r in records}
    tasks = {}
    if task_ids:
        rows = (await db.execute(select(TaskModel).where(TaskModel.id.in_(task_ids)))).scalars().all()
        tasks = {t.id: t.title for t in rows}
    items = [DownloadItem(task_id=r.task_id, task_title=tasks.get(r.task_id, ""), downloaded_at=r.downloaded_at) for r in records]
    return ok(items)


@router.get("/users/me/likes")
async def my_likes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:likes")),
):
    result = await db.execute(
        select(TaskLike).where(TaskLike.user_id == user.id)
        .order_by(desc(TaskLike.created_at)).limit(50)
    )
    records = list(result.scalars().all())
    task_ids = {r.task_id for r in records}
    tasks = {}
    if task_ids:
        rows = (await db.execute(select(TaskModel).where(TaskModel.id.in_(task_ids)))).scalars().all()
        tasks = {t.id: t.title for t in rows}
    items = [LikeItem(task_id=r.task_id, task_title=tasks.get(r.task_id, ""), created_at=r.created_at) for r in records]
    return ok(items)


@router.post("/users/me/avatar")
async def set_avatar(
    fingerprint_id: int = Form(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("user:avatar")),
):
    # 查指纹
    fp = (await db.execute(
        select(Fingerprint).where(Fingerprint.id == fingerprint_id)
    )).scalar_one_or_none()
    if not fp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="指纹不存在")
    if fp.detected_type and fp.detected_type not in ("png", "jpeg", "gif"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="头像仅支持 PNG / JPEG / GIF 图片")

    # 建 FileRecord
    record = FileRecord(
        fingerprint_id=fp.id, filename="avatar", size=fp.size, uploaded_by=user.id,
    )
    db.add(record)
    await db.flush()

    user.avatar_record_id = record.id
    await db.commit()
    await db.refresh(user)
    return ok({"avatar_url": f"/api/v1/files/{fp.sha256}"})
