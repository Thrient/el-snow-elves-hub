"""管理后台 — 不设统一鉴权，每个端点自管权限"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import async_session, get_db
from app.api.Deps import get_current_user, require_perm
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.FileValidator import validate_file_size
from app.identity.entity.User import User
from app.release.entity.DownloadVersion import DownloadVersion
from app.release.entity.VersionFile import VersionFile
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.task.entity.TaskLike import TaskLike
from app.task.entity.DownloadRecord import DownloadRecord
from app.task.entity.TaskView import TaskView
from app.forum.entity.ForumPost import ForumPost
from app.notification.entity.Notification import Notification
from app.infrastructure.rbac.entity.Role import Role as RoleModel
from app.infrastructure.rbac.entity.Permission import Permission as PermissionModel
from app.infrastructure.rbac.entity.RolePermission import RolePermission
from app.infrastructure.rbac.entity.UserRole import UserRole
from app.infrastructure.navigation.entity.Route import Route as RouteModel
from app.admin.Schema.StatsResponse import StatsResponse
from app.admin.Schema.UserItem import UserItem, UserRoleUpdate
from app.admin.Schema.VersionCreate import VersionCreate, VersionItem
from app.admin.Schema.BlobSchema import BlobCheckRequest, BlobCheckResponse, BlobUploadResponse
from app.admin.Schema.RbacSchema import PermCreate, PermUpdate, RoleCreate, RoleUpdate

router = APIRouter(prefix="/admin", tags=["管理后台"])

# ═══════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════

@router.get("/stats", response_model=StatsResponse,
            dependencies=[Depends(require_perm("dashboard:view"))])
async def get_stats(db: AsyncSession = Depends(get_db)):
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    version_count = (await db.execute(select(func.count(DownloadVersion.id)))).scalar() or 0
    online = counts()
    return StatsResponse(
        user_count=user_count, version_count=version_count,
        desktop_online=online.get("desktop", 0), web_online=online.get("web", 0),
    )

# ═══════════════════════════════════════════
# Users
# ═══════════════════════════════════════════

@router.get("/users", response_model=list[UserItem],
            dependencies=[Depends(require_perm("user:list"))])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [UserItem.model_validate(u) for u in users]


@router.put("/users/{user_id}/roles",
            dependencies=[Depends(require_perm("user:assign"))])
async def update_user_roles(user_id: int, body: UserRoleUpdate, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    for rid in body.role_ids:
        db.add(UserRole(user_id=user_id, role_id=rid))
    await db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/disable",
            dependencies=[Depends(require_perm("user:assign"))])
async def toggle_disable_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_disabled = not user.is_disabled
    await db.commit()
    return {"ok": True, "is_disabled": user.is_disabled}


@router.delete("/users/{user_id}",
               dependencies=[Depends(require_perm("user:assign"))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    from sqlalchemy import update as sql_update

    user_post_ids = (
        (await db.execute(select(ForumPost.id).where(ForumPost.author_id == user_id)))
        .scalars().all()
    )
    if user_post_ids:
        await db.execute(sql_update(ForumPost).where(ForumPost.parent_id.in_(user_post_ids)).values(parent_id=None))
        await db.execute(sql_update(ForumPost).where(ForumPost.thread_id.in_(user_post_ids)).values(thread_id=None))
        await db.execute(delete(ForumPost).where(ForumPost.author_id == user_id))

    await db.execute(delete(TaskLike).where(TaskLike.user_id == user_id))
    await db.execute(delete(Comment).where(Comment.user_id == user_id))
    await db.execute(delete(Notification).where(Notification.receiver_id == user_id))
    await db.execute(delete(TaskModel).where(TaskModel.author_id == user_id))

    await db.execute(sql_update(Notification).where(Notification.sender_id == user_id).values(sender_id=None))
    await db.execute(sql_update(DownloadRecord).where(DownloadRecord.user_id == user_id).values(user_id=None))
    await db.execute(sql_update(TaskView).where(TaskView.user_id == user_id).values(user_id=None))

    await db.flush()
    await db.delete(user)
    await db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════
# Roles
# ═══════════════════════════════════════════

@router.get("/roles", dependencies=[Depends(require_perm("role:list"))])
async def list_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel))
    return [
        {"id": r.id, "name": r.name, "description": r.description,
         "data_scope": r.data_scope,
         "permissions": [{"code": p.code, "name": p.name} for p in (r.permissions or [])]}
        for r in result.scalars().all()
    ]


@router.put("/roles/{role_id}/permissions",
            dependencies=[Depends(require_perm("role:update"))])
async def update_role_permissions(role_id: int, body: PermUpdate, db: AsyncSession = Depends(get_db)):
    role = (await db.execute(select(RoleModel).where(RoleModel.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    for pid in body.permission_ids:
        db.add(RolePermission(role_id=role_id, permission_id=pid))
    await db.commit()
    return {"ok": True}


@router.post("/roles", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_perm("role:create"))])
async def create_role(body: RoleCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(RoleModel).where(RoleModel.name == body.name))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="角色名已存在")
    role = RoleModel(name=body.name, description=body.description, data_scope=body.data_scope)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return {"id": role.id, "name": role.name, "description": role.description, "data_scope": role.data_scope, "permissions": []}


@router.put("/roles/{role_id}",
            dependencies=[Depends(require_perm("role:update"))])
async def update_role(role_id: int, body: RoleUpdate, db: AsyncSession = Depends(get_db)):
    role = (await db.execute(select(RoleModel).where(RoleModel.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if body.name is not None:
        dup = (await db.execute(select(RoleModel).where(RoleModel.name == body.name, RoleModel.id != role_id))).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail="角色名已存在")
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.data_scope is not None:
        role.data_scope = body.data_scope
    await db.commit()
    await db.refresh(role)
    return {"id": role.id, "name": role.name, "description": role.description, "data_scope": role.data_scope}


@router.delete("/roles/{role_id}",
               dependencies=[Depends(require_perm("role:delete"))])
async def delete_role(role_id: int, db: AsyncSession = Depends(get_db)):
    role = (await db.execute(select(RoleModel).where(RoleModel.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    await db.execute(delete(UserRole).where(UserRole.role_id == role_id))
    await db.delete(role)
    await db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════
# Permissions
# ═══════════════════════════════════════════

@router.get("/permissions", dependencies=[Depends(require_perm("perm:list"))])
async def list_permissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PermissionModel))
    return [{"id": p.id, "code": p.code, "name": p.name} for p in result.scalars().all()]


@router.post("/permissions", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_perm("perm:create"))])
async def create_permission(body: PermCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(PermissionModel).where(PermissionModel.code == body.code))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="权限码已存在")
    perm = PermissionModel(code=body.code, name=body.name)
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return {"id": perm.id, "code": perm.code, "name": perm.name}


@router.put("/permissions/{perm_id}",
            dependencies=[Depends(require_perm("perm:update"))])
async def update_permission(perm_id: int, body: PermCreate, db: AsyncSession = Depends(get_db)):
    perm = (await db.execute(select(PermissionModel).where(PermissionModel.id == perm_id))).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="权限不存在")
    if body.code != perm.code:
        dup = (await db.execute(select(PermissionModel).where(PermissionModel.code == body.code))).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail="权限码已存在")
        perm.code = body.code
    perm.name = body.name
    await db.commit()
    await db.refresh(perm)
    return {"id": perm.id, "code": perm.code, "name": perm.name}


@router.delete("/permissions/{perm_id}",
               dependencies=[Depends(require_perm("perm:delete"))])
async def delete_permission(perm_id: int, db: AsyncSession = Depends(get_db)):
    perm = (await db.execute(select(PermissionModel).where(PermissionModel.id == perm_id))).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="权限不存在")
    if perm.code == "*":
        raise HTTPException(status_code=400, detail="不能删除超级管理员权限")
    await db.execute(delete(RolePermission).where(RolePermission.permission_id == perm_id))
    await db.delete(perm)
    await db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════
# Blobs
# ═══════════════════════════════════════════

@router.post("/blobs/check", response_model=BlobCheckResponse)
async def check_blobs(body: BlobCheckRequest):
    """秒传预检：返回哪些 SHA256 已存在"""
    async with async_session() as db:
        result = await db.execute(
            select(Fingerprint.sha256).where(Fingerprint.sha256.in_(body.sha256_list))
        )
        existing = [row[0] for row in result.all()]
        return BlobCheckResponse(
            existing=existing,
            missing=[h for h in body.sha256_list if h not in existing],
        )


@router.post("/blobs/upload", response_model=BlobUploadResponse)
async def upload_blob(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传单个文件 blob"""
    validate_file_size(file)
    data = await file.read()
    async with async_session() as db:
        fp = await storage_service.store(db, data)
        await db.commit()
        return {"fingerprint_id": fp.id, "sha256": fp.sha256, "size": fp.size}

# ═══════════════════════════════════════════
# Versions
# ═══════════════════════════════════════════

@router.get("/versions", response_model=list[VersionItem],
            dependencies=[Depends(require_perm("version:list"))])
async def list_versions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DownloadVersion, func.count(VersionFile.id).label("file_count"))
        .outerjoin(VersionFile, VersionFile.version_id == DownloadVersion.id)
        .group_by(DownloadVersion.id)
        .order_by(DownloadVersion.created_at.desc())
    )
    rows = result.all()
    items = []
    for row in rows:
        v = row[0]
        fc = row[1]
        items.append(VersionItem(
            id=v.id, version=v.version, platform=v.platform,
            changelog=v.changelog, is_latest=v.is_latest,
            is_mandatory=v.is_mandatory, created_at=v.created_at,
            file_count=fc,
        ))
    return items


@router.post("/versions", status_code=status.HTTP_201_CREATED)
async def create_version(body: VersionCreate, user: User = Depends(require_perm("version:create")), db: AsyncSession = Depends(get_db)):
    if body.is_latest:
        await db.execute(
            update(DownloadVersion)
            .where(DownloadVersion.is_latest == True)
            .values(is_latest=False)
        )

    version_data = body.model_dump(exclude={"files"})
    v = DownloadVersion(**version_data)
    db.add(v)
    await db.flush()

    for f_entry in body.files:
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == f_entry.sha256)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(400, f"blob not found: {f_entry.sha256}")
        record = (await db.execute(
            select(FileRecord).where(FileRecord.fingerprint_id == fp.id)
        )).scalar_one_or_none()
        if not record:
            record = await storage_service.create_record(
                db, fp, filename=f_entry.path.split('/').pop() or "blob",
                content_type="application/octet-stream", uploaded_by=user.id,
            )
            await db.flush()
        db.add(VersionFile(
            version_id=v.id,
            relative_path=f_entry.path,
            file_record_id=record.id,
        ))

    await db.commit()
    await db.refresh(v)
    return {"ok": True, "id": v.id}


@router.delete("/versions/{version_id}",
               dependencies=[Depends(require_perm("version:delete"))])
async def delete_version(version_id: int, db: AsyncSession = Depends(get_db)):
    v = (await db.execute(select(DownloadVersion).where(DownloadVersion.id == version_id))).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="版本不存在")
    await db.execute(delete(VersionFile).where(VersionFile.version_id == version_id))
    await db.delete(v)
    await db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════
# Tasks
# ═══════════════════════════════════════════

@router.get("/tasks", dependencies=[Depends(require_perm("task:list"))])
async def list_all_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).order_by(TaskModel.created_at.desc()))
    return [
        {
            "id": t.id, "title": t.title, "author_id": t.author_id,
            "category": t.category, "version": t.version, "status": t.status,
            "download_count": t.download_count, "like_count": t.like_count,
            "created_at": t.created_at.isoformat(),
        }
        for t in result.scalars().all()
    ]


@router.put("/tasks/{task_id}/status",
            dependencies=[Depends(require_perm("task:approve"))])
async def update_task_status(task_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(TaskModel).where(TaskModel.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    if "status" in body:
        t.status = body["status"]
    await db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}",
               dependencies=[Depends(require_perm("task:delete"))])
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    t = (await db.execute(select(TaskModel).where(TaskModel.id == task_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    await db.delete(t)
    await db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════

@router.get("/routes", dependencies=[Depends(require_perm("route:list"))])
async def list_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RouteModel).order_by(RouteModel.sort_order))
    return [
        {
            "id": r.id, "path": r.path, "title": r.title, "icon": r.icon,
            "parent_id": r.parent_id, "perm": r.perm, "enabled": r.enabled,
            "in_menu": r.in_menu, "sort_order": r.sort_order, "component": r.component,
            "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat(),
        }
        for r in result.scalars().all()
    ]


@router.post("/routes", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_perm("route:create"))])
async def create_route(body: dict, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(RouteModel).where(RouteModel.path == body["path"])
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="路由路径已存在")
    if body.get("parent_id") is not None:
        parent = (await db.execute(
            select(RouteModel).where(RouteModel.id == body["parent_id"])
        )).scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=400, detail="父级路由不存在")
    route = RouteModel(**body)
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return {"ok": True, "id": route.id}


@router.put("/routes/{route_id}",
            dependencies=[Depends(require_perm("route:update"))])
async def update_route(route_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    route = (await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )).scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    for field, value in body.items():
        setattr(route, field, value)
    await db.commit()
    return {"ok": True}


@router.delete("/routes/{route_id}",
               dependencies=[Depends(require_perm("route:delete"))])
async def delete_route(route_id: int, db: AsyncSession = Depends(get_db)):
    route = (await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )).scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    await db.delete(route)
    await db.commit()
    return {"ok": True}


@router.put("/routes/{route_id}/toggle",
            dependencies=[Depends(require_perm("route:toggle"))])
async def toggle_route(route_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    route = (await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )).scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    route.enabled = body.get("enabled", not route.enabled)
    await db.commit()
    return {"ok": True, "enabled": route.enabled}

# ═══════════════════════════════════════════
# SSE 实时在线数
# ═══════════════════════════════════════════

import asyncio
import json

from fastapi import Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.infrastructure.security.Token import decode_access_token
from app.infrastructure.sse.OnlineTracker import admin_queues_list, counts, _lock as tracker_lock
from app.infrastructure.sse.SseConnection import SseConnection

security = HTTPBearer(auto_error=False)


async def get_admin_user(
    token: str | None = Query(None),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db_admin: AsyncSession = Depends(get_db),
) -> User:
    jwt = None
    if credentials:
        jwt = credentials.credentials
    elif token:
        jwt = token

    if not jwt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要登录")

    payload = decode_access_token(jwt)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或过期的令牌")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌格式错误")

    user = (await db_admin.execute(
        select(User).where(User.id == int(user_id))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    return user


@router.get("/stream")
async def admin_stream(user: User = Depends(get_admin_user)):
    queue: asyncio.Queue = asyncio.Queue()
    admin_queues_list().append(queue)

    async with tracker_lock:
        initial = json.dumps({"type": "online_count", **counts()})
    await queue.put(initial)

    conn = SseConnection(queue, on_disconnect=lambda: admin_queues_list().remove(queue))
    return conn.stream()
