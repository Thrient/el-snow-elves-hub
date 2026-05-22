"""API v1 路由聚合"""
from typing import Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.api.v1.auth import router as auth_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.files import router as files_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.forum import router as forum_router
from app.api.v1.blobs import router as blobs_router
from app.api.v1.notifications import router as notifications_router
from app.core.database import get_db
from app.core.deps import get_optional_user
from app.models.download import DownloadVersion
from app.models.route import Route
from app.models.user import User
from app.schemas.route import RoutePublic

router = APIRouter()

router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(users_router)
router.include_router(files_router)
router.include_router(uploads_router)
router.include_router(forum_router)
router.include_router(blobs_router)
router.include_router(notifications_router)


@router.get("/ping")
async def ping():
    return {"ping": "pong"}


@router.get("/versions")
async def list_public_versions(db=Depends(get_db)):
    """公开下载版本列表，无需登录"""
    result = await db.execute(
        select(DownloadVersion).order_by(DownloadVersion.created_at.desc())
    )
    versions = result.scalars().all()
    return {
        "code": 0,
        "data": [
            {
                "id": v.id,
                "version": v.version,
                "platform": v.platform,
                "changelog": v.changelog,
                "is_latest": v.is_latest,
                "is_mandatory": v.is_mandatory,
                "created_at": v.created_at.isoformat(),
            }
            for v in versions
        ],
    }


@router.get("/routes", response_model=list[RoutePublic])
async def get_routes(
    db=Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """获取当前用户可见的路由树（匿名用户只返回公开路由）"""
    result = await db.execute(
        select(Route).where(Route.enabled == True).order_by(Route.sort_order)
    )
    all_routes = result.scalars().all()

    # 按权限过滤
    user_perms: set[str] = set()
    if user:
        user_perms = set(user.permissions or [])

    visible: list[Route] = []
    for r in all_routes:
        if r.perm is None:
            visible.append(r)
        elif user_perms and ("*" in user_perms or r.perm in user_perms):
            visible.append(r)

    # 构建树结构
    route_map = {r.id: RoutePublic(
        id=r.id, path=r.path, title=r.title, icon=r.icon,
        parent_id=r.parent_id, perm=r.perm, in_menu=r.in_menu,
        component=r.component,
    ) for r in visible}

    roots: list[RoutePublic] = []
    for r in visible:
        node = route_map[r.id]
        if r.parent_id is not None and r.parent_id in route_map:
            route_map[r.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots
