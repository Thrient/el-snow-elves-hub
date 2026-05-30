"""前端路由元数据 — 公开 API"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.infrastructure.Database import get_db
from app.api.Deps import get_optional_user, require_perm_any
from app.infrastructure.navigation.entity.Route import Route
from app.infrastructure.navigation.Schema import RoutePublic
from app.identity.entity.User import User

router = APIRouter(tags=["路由"])


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
    else:
        from app.infrastructure.rbac.entity.Role import Role
        anon = (await db.execute(
            select(Role).where(Role.name == "anonymous")
        )).scalar_one_or_none()
        if anon and anon.permissions:
            user_perms = {p.code for p in anon.permissions}

    visible: list[Route] = []
    for r in all_routes:
        if r.perm is None:
            visible.append(r)
        elif user_perms and ("*" in user_perms or r.perm in user_perms):
            visible.append(r)

    route_map = {
        r.id: RoutePublic(
            id=r.id, path=r.path, title=r.title, icon=r.icon,
            parent_id=r.parent_id, perm=r.perm, in_menu=r.in_menu,
            component=r.component,
        )
        for r in visible
    }

    roots: list[RoutePublic] = []
    for r in visible:
        node = route_map[r.id]
        if r.parent_id is not None and r.parent_id in route_map:
            route_map[r.parent_id].children.append(node)
        else:
            roots.append(node)

    # 剪枝：菜单中无可见子节点且自身无权限的父路由隐藏
    def prune(node: RoutePublic) -> bool:
        node.children = [c for c in node.children if prune(c)]
        if not node.in_menu:
            return True  # 非菜单路由始终保留（路由匹配用）
        if len(node.children) > 0:
            return True  # 有可见子节点，保留
        # 叶子菜单节点：perm 为 null 则隐藏，有 perm 则保留（RouteGuard 负责拦截）
        return node.perm is not None

    roots = [r for r in roots if prune(r)]
    return roots
