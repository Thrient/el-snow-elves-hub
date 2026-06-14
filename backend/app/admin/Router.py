"""管理后台 — 不设统一鉴权，每个端点自管权限"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm
from app.identity.entity.User import User
from app.release.entity.DownloadVersion import DownloadVersion
from app.release.entity.VersionFile import VersionFile
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.StorageService import storage_service
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
from app.admin.Schema.VersionCreate import VersionCreate
from app.admin.Schema.RbacSchema import PermCreate, PermUpdate, RoleCreate, RoleUpdate
from app.admin.Schema.RouteCreate import RouteCreate
from app.admin.Schema.RouteUpdate import RouteUpdate

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
            dependencies=[Depends(require_perm("user:disable"))])
async def toggle_disable_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_disabled = not user.is_disabled
    await db.commit()
    return {"ok": True, "is_disabled": user.is_disabled}


@router.delete("/users/{user_id}",
               dependencies=[Depends(require_perm("user:delete"))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    from sqlalchemy import update as sql_update

    await db.execute(sql_update(ForumPost).where(ForumPost.author_id == user_id).values(author_id=None))

    await db.execute(delete(TaskLike).where(TaskLike.user_id == user_id))
    await db.execute(delete(Comment).where(Comment.user_id == user_id))
    await db.execute(delete(Notification).where(Notification.receiver_id == user_id))
    await db.execute(delete(TaskModel).where(TaskModel.author_id == user_id))

    await db.execute(sql_update(Notification).where(Notification.sender_id == user_id).values(sender_id=None))
    await db.execute(sql_update(DownloadRecord).where(DownloadRecord.user_id == user_id).values(user_id=None))
    await db.execute(sql_update(TaskView).where(TaskView.user_id == user_id).values(user_id=None))
    await db.execute(sql_update(FileRecord).where(FileRecord.uploaded_by == user_id).values(uploaded_by=None))

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
            dependencies=[Depends(require_perm("role:permissions"))])
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
            select(Fingerprint).where(Fingerprint.id == f_entry.fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(400, f"指纹不存在: {f_entry.fingerprint_id}")

        record = await storage_service.create_record_from_fingerprint(
            db, f_entry.fingerprint_id,
            filename=f_entry.path.split('/').pop() or "blob",
            uploaded_by=user.id,
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
# Routes
# ═══════════════════════════════════════════

@router.get("/routes", dependencies=[Depends(require_perm("admin:routes"))])
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
async def create_route(body: RouteCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(RouteModel).where(RouteModel.path == body.path)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="路由路径已存在")
    if body.parent_id is not None:
        parent = (await db.execute(
            select(RouteModel).where(RouteModel.id == body.parent_id)
        )).scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=400, detail="父级路由不存在")
    route = RouteModel(**body.model_dump())
    db.add(route)
    await db.commit()
    await db.refresh(route)
    return {"ok": True, "id": route.id}


@router.put("/routes/{route_id}",
            dependencies=[Depends(require_perm("route:update"))])
async def update_route(route_id: int, body: RouteUpdate, db: AsyncSession = Depends(get_db)):
    route = (await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )).scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    for field, value in body.model_dump(exclude_none=True).items():
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

from fastapi import Request as FastAPIRequest
from app.infrastructure.sse.OnlineTracker import admin_queues_list, counts, _lock as tracker_lock
from app.infrastructure.sse.SseConnection import SseConnection
from el_token.ElLogic import ElLogic


async def get_admin_user(
    request: FastAPIRequest,
    db_admin: AsyncSession = Depends(get_db),
) -> User:
    uid = ElLogic.get_login_id()
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要登录")

    user = (await db_admin.execute(
        select(User).where(User.id == int(uid))
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
