"""API v1 路由聚合"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.auth import router as auth_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.forum import router as forum_router
from app.api.v1.versions import router as versions_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.client_stream import router as client_stream_router
from app.api.v1.admin_stream import router as admin_stream_router
from app.api.v1.files import router as files_router
from app.core.database import get_db
from app.core.deps import get_optional_user, require_perm_any
from app.models.route import Route
from app.models.user import User
from app.schemas.route import RoutePublic

router = APIRouter()

router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(users_router)
router.include_router(uploads_router)
router.include_router(forum_router)
router.include_router(versions_router)
router.include_router(notifications_router)
router.include_router(client_stream_router)
router.include_router(admin_stream_router)
router.include_router(files_router)


@router.get("/ping")
async def ping(_=Depends(require_perm_any("public:ping"))):
    return {"ping": "pong"}


@router.get("/routes", response_model=list[RoutePublic])
async def get_routes(
    db=Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
    _=Depends(require_perm_any("route:list")),
):
    """获取当前用户可见的路由树（匿名用户只返回公开路由）"""
    result = await db.execute(
        select(Route).where(Route.enabled == True).order_by(Route.sort_order)
    )
    all_routes = result.scalars().all()

    user_perms: set[str] = set()
    if user:
        user_perms = set(user.permissions or [])

    visible: list[Route] = []
    for r in all_routes:
        if r.perm is None:
            visible.append(r)
        elif user_perms and ("*" in user_perms or r.perm in user_perms):
            visible.append(r)

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
