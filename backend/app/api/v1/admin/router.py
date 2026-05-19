"""管理后台 API — 仪表盘 / 用户管理 / 下载版本管理"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_perm
from app.models.user import User
from app.models.download import DownloadVersion

from app.models.task import Task as TaskModel

router = APIRouter(prefix="/admin", tags=["管理后台"], dependencies=[Depends(require_perm("admin.access"))])


# ── Schemas ──

class StatsResponse(BaseModel):
    user_count: int
    version_count: int


class UserItem(BaseModel):
    id: int
    username: str
    email: str
    role_name: str | None = None
    role_id: int | None = None
    permissions: list | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionCreate(BaseModel):
    version: str
    platform: str = "Windows x64"
    changelog: str | None = None
    file_url: str
    file_size: int | None = None
    is_latest: bool = False


class VersionItem(BaseModel):
    id: int
    version: str
    platform: str
    changelog: str | None
    file_url: str
    file_size: int | None
    is_latest: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Roles & Permissions ──

from app.models.rbac import Role as RoleModel, Permission as PermissionModel, RolePermission

@router.get("/roles")
async def list_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel))
    roles = result.scalars().all()
    return [{"id": r.id, "name": r.name, "description": r.description,
             "permissions": [{"code": p.code, "name": p.name} for p in (r.permissions or [])]} for r in roles]


@router.get("/permissions")
async def list_permissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PermissionModel))
    return [{"id": p.id, "code": p.code, "name": p.name} for p in result.scalars().all()]


class PermUpdate(BaseModel):
    permission_ids: list[int]


@router.put("/roles/{role_id}/permissions")
async def update_role_permissions(role_id: int, body: PermUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel).where(RoleModel.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    # Clear old + insert new (avoids async lazy load)
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    for pid in body.permission_ids:
        db.add(RolePermission(role_id=role_id, permission_id=pid))
    await db.commit()
    return {"ok": True}


class UserRoleUpdate(BaseModel):
    role_id: int


# ── Dashboard ──

@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    user_count = (await db.execute(select(func.count(User.id)))).scalar()
    version_count = (await db.execute(select(func.count(DownloadVersion.id)))).scalar()
    return StatsResponse(user_count=user_count or 0, version_count=version_count or 0)


# ── Users ──

@router.get("/users", response_model=list[UserItem])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [UserItem.model_validate(u) for u in result.scalars().all()]


@router.put("/users/{user_id}/role")
async def update_user_role(user_id: int, body: UserRoleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.role_id = body.role_id
    await db.commit()
    return {"ok": True}


# ── Download Versions ──

@router.get("/versions", response_model=list[VersionItem])
async def list_versions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DownloadVersion).order_by(DownloadVersion.created_at.desc()))
    return [VersionItem.model_validate(v) for v in result.scalars().all()]


@router.post("/versions", status_code=status.HTTP_201_CREATED)
async def create_version(body: VersionCreate, db: AsyncSession = Depends(get_db)):
    if body.is_latest:
        # 取消旧的最新标记
        old = (await db.execute(select(DownloadVersion).where(DownloadVersion.is_latest == True))).scalars().all()
        for o in old:
            o.is_latest = False
    v = DownloadVersion(**body.model_dump())
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return {"ok": True, "id": v.id}


@router.delete("/versions/{version_id}")
async def delete_version(version_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DownloadVersion).where(DownloadVersion.id == version_id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="版本不存在")
    await db.delete(v)
    await db.commit()
    return {"ok": True}


# ── Task audit ──

@router.get("/tasks/pending")
async def list_pending_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskModel).where(TaskModel.status == "pending").order_by(TaskModel.created_at.desc())
    )
    tasks = result.scalars().all()
    return [{"id": t.id, "title": t.title, "author_id": t.author_id, "category": t.category, "version": t.version, "file_size": t.file_size, "created_at": t.created_at.isoformat()} for t in tasks]


@router.post("/tasks/{task_id}/approve")
async def approve_task(task_id: int, reason: str = "", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    t.status = "approved"
    await db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/reject")
async def reject_task(task_id: int, reason: str = "", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    t.status = "rejected"
    await db.commit()
    return {"ok": True}


@router.get("/tasks")
async def list_all_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskModel).order_by(TaskModel.created_at.desc())
    )
    tasks = result.scalars().all()
    return [{"id": t.id, "title": t.title, "author_id": t.author_id, "category": t.category,
             "version": t.version, "status": t.status, "download_count": t.download_count,
             "like_count": t.like_count, "file_size": t.file_size,
             "created_at": t.created_at.isoformat()} for t in tasks]


@router.put("/tasks/{task_id}/status")
async def update_task_status(task_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    if "status" in body:
        t.status = body["status"]
    await db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


# ── Route Management ──

from app.models.route import Route as RouteModel
from app.schemas.route import RouteAdmin, RouteCreate, RouteUpdate, RouteToggle


@router.get("/routes", response_model=list[RouteAdmin])
async def list_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RouteModel).order_by(RouteModel.sort_order)
    )
    return [RouteAdmin.model_validate(r) for r in result.scalars().all()]


@router.post("/routes", status_code=status.HTTP_201_CREATED, response_model=RouteAdmin)
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
    return RouteAdmin.model_validate(route)


@router.put("/routes/{route_id}", response_model=RouteAdmin)
async def update_route(route_id: int, body: RouteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(route, field, value)
    await db.commit()
    await db.refresh(route)
    return RouteAdmin.model_validate(route)


@router.delete("/routes/{route_id}")
async def delete_route(route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    await db.delete(route)
    await db.commit()
    return {"ok": True}


@router.put("/routes/{route_id}/toggle")
async def toggle_route(route_id: int, body: RouteToggle, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RouteModel).where(RouteModel.id == route_id)
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="路由不存在")
    route.enabled = body.enabled
    await db.commit()
    return {"ok": True, "enabled": route.enabled}
