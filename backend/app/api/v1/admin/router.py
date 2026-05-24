"""管理后台 API — 每个写操作端点挂对应权限"""

from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, get_db
from app.core.deps import get_current_user, require_perm
from app.core.online_tracker import counts
from app.utils.fingerprint_service import store
from app.utils.file_validator import validate_file_size
from app.models.user import User
from app.models.download import DownloadVersion
from app.models.fingerprint import Fingerprint
from app.models.task import Task as TaskModel
from app.models.version_file import VersionFile
from app.models.task import Task as TaskModel, Comment, TaskLike, DownloadRecord, TaskView
from app.models.forum import ForumPost
from app.models.notification import Notification
from app.models.rbac import Role as RoleModel, Permission as PermissionModel, RolePermission, UserRole

router = APIRouter(
    prefix="/admin",
    tags=["管理后台"],
    dependencies=[Depends(require_perm("admin:access"))],
)


# ── Schemas ──

class StatsResponse(BaseModel):
    user_count: int
    version_count: int
    desktop_online: int
    web_online: int


class UserItem(BaseModel):
    id: int
    username: str
    email: str
    role_names: list = []
    role_ids: list = []
    permissions: list | None = None
    is_disabled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class FileEntry(BaseModel):
    path: str
    sha256: str
    size: int


class VersionCreate(BaseModel):
    version: str
    platform: str = "Windows x64"
    changelog: str | None = None
    is_latest: bool = False
    is_mandatory: bool = False
    files: list[FileEntry]


class VersionItem(BaseModel):
    id: int
    version: str
    platform: str
    changelog: str | None = None
    is_latest: bool
    is_mandatory: bool
    created_at: datetime
    file_count: int | None = None  # populated by query join

    model_config = {"from_attributes": True}


class BlobCheckRequest(BaseModel):
    sha256_list: list[str]


class BlobCheckResponse(BaseModel):
    existing: list[str]
    missing: list[str]


class BlobUploadResponse(BaseModel):
    fingerprint_id: int
    sha256: str
    size: int


# ── Dashboard ──

@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    version_count = (await db.execute(select(func.count(DownloadVersion.id)))).scalar() or 0
    online = counts()
    return StatsResponse(
        user_count=user_count,
        version_count=version_count,
        desktop_online=online.get("desktop", 0),
        web_online=online.get("web", 0),
    )


# ── Users ──

@router.get("/users", response_model=list[UserItem],
            dependencies=[Depends(require_perm("user:list"))])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [UserItem.model_validate(u) for u in users]


class UserRoleUpdate(BaseModel):
    role_ids: list[int]


@router.put("/users/{user_id}/roles",
            dependencies=[Depends(require_perm("user:assign"))])
async def update_user_roles(user_id: int, body: UserRoleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    # clear old roles
    await db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    for rid in body.role_ids:
        db.add(UserRole(user_id=user_id, role_id=rid))
    await db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/disable",
            dependencies=[Depends(require_perm("user:assign"))])
async def toggle_disable_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_disabled = not user.is_disabled
    await db.commit()
    return {"ok": True, "is_disabled": user.is_disabled}


@router.delete("/users/{user_id}",
               dependencies=[Depends(require_perm("user:assign"))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    from sqlalchemy import update as sql_update

    # 清理 ForumPost：先解除自引用外键，再删帖
    user_post_ids = (
        (await db.execute(select(ForumPost.id).where(ForumPost.author_id == user_id)))
        .scalars().all()
    )
    if user_post_ids:
        await db.execute(
            sql_update(ForumPost)
            .where(ForumPost.parent_id.in_(user_post_ids))
            .values(parent_id=None)
        )
        await db.execute(
            sql_update(ForumPost)
            .where(ForumPost.thread_id.in_(user_post_ids))
            .values(thread_id=None)
        )
        await db.execute(delete(ForumPost).where(ForumPost.author_id == user_id))

    # 清理其余关联数据
    await db.execute(delete(TaskLike).where(TaskLike.user_id == user_id))
    await db.execute(delete(Comment).where(Comment.user_id == user_id))
    await db.execute(delete(Notification).where(Notification.receiver_id == user_id))
    await db.execute(delete(TaskModel).where(TaskModel.author_id == user_id))

    # 可空字段置 NULL
    await db.execute(sql_update(Notification).where(Notification.sender_id == user_id).values(sender_id=None))
    await db.execute(sql_update(DownloadRecord).where(DownloadRecord.user_id == user_id).values(user_id=None))
    await db.execute(sql_update(TaskView).where(TaskView.user_id == user_id).values(user_id=None))

    await db.flush()
    await db.delete(user)
    await db.commit()
    return {"ok": True}


# ── Roles ──

@router.get("/roles", dependencies=[Depends(require_perm("role:list"))])
async def list_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel))
    roles = result.scalars().all()
    return [{"id": r.id, "name": r.name, "description": r.description,
             "data_scope": r.data_scope,
             "permissions": [{"code": p.code, "name": p.name} for p in (r.permissions or [])]} for r in roles]


class PermUpdate(BaseModel):
    permission_ids: list[int]


@router.put("/roles/{role_id}/permissions",
            dependencies=[Depends(require_perm("role:update"))])
async def update_role_permissions(role_id: int, body: PermUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel).where(RoleModel.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
    for pid in body.permission_ids:
        db.add(RolePermission(role_id=role_id, permission_id=pid))
    await db.commit()
    return {"ok": True}


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    data_scope: str = "self"


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


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_scope: str | None = None


@router.put("/roles/{role_id}",
            dependencies=[Depends(require_perm("role:update"))])
async def update_role(role_id: int, body: RoleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleModel).where(RoleModel.id == role_id))
    role = result.scalar_one_or_none()
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
    result = await db.execute(select(RoleModel).where(RoleModel.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    # unlink users first
    await db.execute(delete(UserRole).where(UserRole.role_id == role_id))
    await db.delete(role)
    await db.commit()
    return {"ok": True}


# ── Permissions ──

@router.get("/permissions", dependencies=[Depends(require_perm("perm:list"))])
async def list_permissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PermissionModel))
    return [{"id": p.id, "code": p.code, "name": p.name} for p in result.scalars().all()]


class PermCreate(BaseModel):
    code: str
    name: str


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
    result = await db.execute(select(PermissionModel).where(PermissionModel.id == perm_id))
    perm = result.scalar_one_or_none()
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
    result = await db.execute(select(PermissionModel).where(PermissionModel.id == perm_id))
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="权限不存在")
    if perm.code == "*":
        raise HTTPException(status_code=400, detail="不能删除超级管理员权限")
    await db.execute(delete(RolePermission).where(RolePermission.permission_id == perm_id))
    await db.delete(perm)
    await db.commit()
    return {"ok": True}


# ── Blob Uploads ──


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
        fp = await store(db, data)
        await db.commit()
        return BlobUploadResponse(
            fingerprint_id=fp.id, sha256=fp.sha256, size=fp.size
        )


# ── Download Versions ──

@router.get("/versions", response_model=list[VersionItem],
            dependencies=[Depends(require_perm("version:list"))])
async def list_versions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            DownloadVersion,
            func.count(VersionFile.id).label("file_count"),
        )
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
            id=v.id,
            version=v.version,
            platform=v.platform,
            changelog=v.changelog,
            is_latest=v.is_latest,
            is_mandatory=v.is_mandatory,
            created_at=v.created_at,
            file_count=fc,
        ))
    return items


@router.post("/versions", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_perm("version:create"))])
async def create_version(body: VersionCreate, db: AsyncSession = Depends(get_db)):
    if body.is_latest:
        await db.execute(
            update(DownloadVersion).where(DownloadVersion.is_latest == True).values(is_latest=False)
        )

    # Create version record (exclude files field which is not a column)
    version_data = body.model_dump(exclude={"files"})
    v = DownloadVersion(**version_data)
    db.add(v)
    await db.flush()  # get v.id without committing

    for f_entry in body.files:
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == f_entry.sha256)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(
                400,
                f"fingerprint not found for {f_entry.path}: {f_entry.sha256}. Upload blob first.",
            )
        db.add(VersionFile(
            version_id=v.id,
            relative_path=f_entry.path,
            fingerprint_id=fp.id,
        ))

    await db.commit()
    await db.refresh(v)
    return {"ok": True, "id": v.id}


@router.delete("/versions/{version_id}",
               dependencies=[Depends(require_perm("version:delete"))])
async def delete_version(version_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DownloadVersion).where(DownloadVersion.id == version_id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="版本不存在")
    await db.execute(delete(VersionFile).where(VersionFile.version_id == version_id))
    await db.delete(v)
    await db.commit()
    return {"ok": True}


# ── Tasks ──

@router.get("/tasks", dependencies=[Depends(require_perm("task:list"))])
async def list_all_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskModel).order_by(TaskModel.created_at.desc())
    )
    tasks = result.scalars().all()
    return [{"id": t.id, "title": t.title, "author_id": t.author_id, "category": t.category,
             "version": t.version, "status": t.status, "download_count": t.download_count,
             "like_count": t.like_count, "file_size": t.file_size,
             "created_at": t.created_at.isoformat()} for t in tasks]


@router.put("/tasks/{task_id}/status",
            dependencies=[Depends(require_perm("task:approve"))])
async def update_task_status(task_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskModel).where(TaskModel.id == task_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    if "status" in body:
        t.status = body["status"]
    await db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}",
               dependencies=[Depends(require_perm("task:delete"))])
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


@router.get("/routes", response_model=list[RouteAdmin],
            dependencies=[Depends(require_perm("route:list"))])
async def list_routes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RouteModel).order_by(RouteModel.sort_order)
    )
    return [RouteAdmin.model_validate(r) for r in result.scalars().all()]


@router.post("/routes", status_code=status.HTTP_201_CREATED, response_model=RouteAdmin,
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
    return RouteAdmin.model_validate(route)


@router.put("/routes/{route_id}", response_model=RouteAdmin,
            dependencies=[Depends(require_perm("route:update"))])
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


@router.delete("/routes/{route_id}",
               dependencies=[Depends(require_perm("route:delete"))])
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


@router.put("/routes/{route_id}/toggle",
            dependencies=[Depends(require_perm("route:toggle"))])
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
