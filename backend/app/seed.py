"""首次部署：建表 + 默认角色权限 + 管理员"""
import asyncio

from app.infrastructure.Database import engine, async_session, Base
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.Permission import Permission
from app.infrastructure.rbac.entity.RolePermission import RolePermission
from app.infrastructure.navigation.entity.Route import Route as RouteModel
from app.identity.entity.User import User
from app.infrastructure.rbac.entity.UserRole import UserRole
from app.infrastructure.security.Token import hash_password


PERMISSION_CODES = {
    "*": "超级管理员（全部权限）",
    "page:home": "查看首页",
    "page:download": "查看下载页",
    "page:market": "查看任务市场",
    "page:forum": "查看论坛",
    "page:user": "查看用户主页",
    "page:upload": "查看上传页",
    "page:profile": "查看个人中心",
    "page:notification": "查看通知",
    "page:login": "查看登录页",
    "page:dashboard": "查看仪表盘",
    "page:admin-users": "查看用户管理",
    "page:admin-roles": "查看角色管理",
    "page:admin-perms": "查看权限列表",
    "page:admin-versions": "查看版本管理",
    "page:admin-tasks": "查看任务管理",
    "page:admin-routes": "查看路由管理",
    "dashboard:view": "查看仪表盘数据",
    "public:ping": "健康检查",
    "auth:login": "登录",
    "auth:register": "注册",
    "auth:refresh": "刷新令牌",
    "file:check": "文件指纹校验",
    "file:upload": "上传文件",
    "task:list": "查看任务列表",
    "task:download": "下载任务",
    "task:create": "创建任务",
    "task:like": "点赞任务",
    "task:comment": "发表评论",
    "task:approve": "审核任务",
    "task:delete": "删除任务",
    "forum:list": "浏览论坛",
    "forum:post": "发帖回帖",
    "forum:delete": "删帖",
    "forum:manage": "管理论坛",
    "comment:delete": "删除评论",
    "version:list": "查看版本列表",
    "version:download": "下载版本文件",
    "version:create": "创建版本",
    "version:delete": "删除版本",
    "route:list": "查看路由列表",
    "route:create": "创建路由",
    "route:update": "编辑路由",
    "route:delete": "删除路由",
    "route:toggle": "启停路由",
    "notification:list": "查看通知",
    "notification:read": "标记已读",
    "user:list": "查看用户列表",
    "user:assign": "分配角色",
    "user:profile": "个人中心",
    "role:list": "查看角色列表",
    "role:create": "创建角色",
    "role:update": "编辑角色权限",
    "role:delete": "删除角色",
    "perm:list": "查看权限列表",
    "perm:create": "创建权限",
    "perm:update": "编辑权限",
    "perm:delete": "删除权限",
}

ROLES = [
    {"name": "admin", "description": "超级管理员", "data_scope": "all"},
    {"name": "user", "description": "普通用户", "data_scope": "self"},
    {"name": "anonymous", "description": "匿名用户（未登录时的默认权限）", "data_scope": "self"},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        for r in ROLES:
            existing = (await db.execute(
                select(Role).where(Role.name == r["name"])
            )).scalar_one_or_none()
            if not existing:
                db.add(Role(**r))
                print(f"角色已创建: {r['name']}")
            else:
                existing.description = r["description"]
                existing.data_scope = r["data_scope"]
                print(f"角色已更新: {r['name']}")

        await db.commit()
        print("基础角色完成")

        # ── Permissions ──
        for code, name in PERMISSION_CODES.items():
            existing = (await db.execute(
                select(Permission).where(Permission.code == code)
            )).scalar_one_or_none()
            if not existing:
                db.add(Permission(code=code, name=name))
                print(f"权限已创建: {code}")
            else:
                existing.name = name
                print(f"权限已更新: {code}")
        await db.commit()
        print("权限码完成")

        # ── Assign perms to roles ──
        admin_role = (await db.execute(
            select(Role).where(Role.name == "admin")
        )).scalar_one()
        wildcard = (await db.execute(
            select(Permission).where(Permission.code == "*")
        )).scalar_one()

        existing = (await db.execute(
            select(RolePermission).where(
                RolePermission.role_id == admin_role.id,
                RolePermission.permission_id == wildcard.id,
            )
        )).scalar_one_or_none()
        if not existing:
            db.add(RolePermission(role_id=admin_role.id, permission_id=wildcard.id))
            print("admin ← *")
        await db.commit()

        # ── Anonymous role ──
        anon_role = (await db.execute(
            select(Role).where(Role.name == "anonymous")
        )).scalar_one()
        anon_perms = ["page:home", "page:download", "page:market", "page:forum", "page:login"]
        for code in anon_perms:
            p = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one()
            existing = (await db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == anon_role.id,
                    RolePermission.permission_id == p.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(RolePermission(role_id=anon_role.id, permission_id=p.id))
                print(f"anonymous ← {code}")
        await db.commit()

        # ── User role ──
        user_role = (await db.execute(
            select(Role).where(Role.name == "user")
        )).scalar_one()
        for code in ["page:profile"]:
            p = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one()
            existing = (await db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == user_role.id,
                    RolePermission.permission_id == p.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(RolePermission(role_id=user_role.id, permission_id=p.id))
                print(f"user ← {code}")
        await db.commit()

        # ── Admin user ──
        admin_user = (await db.execute(
            select(User).where(User.email == "thrient@petalmail.com")
        )).scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                username="Thrient",
                email="thrient@petalmail.com",
                password_hash=hash_password("21a.@YXW"),
            )
            db.add(admin_user)
            await db.flush()
            db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))
            await db.commit()
            print("管理员已创建")
        else:
            print("管理员已存在，检查角色")
        # Ensure admin role assigned
        if not (await db.execute(
            select(UserRole).where(
                UserRole.user_id == admin_user.id,
                UserRole.role_id == admin_role.id,
            )
        )).scalar_one_or_none():
            db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))
            await db.commit()
            print("管理员角色已补全")

        # ── Routes ──
        route_count = (await db.execute(
            select(func.count(RouteModel.id))
        )).scalar() or 0

        if route_count == 0:
            # Public routes
            db.add_all([
                RouteModel(path="/", title="首页", icon="HomeOutlined", perm="page:home", in_menu=True, sort_order=10, component="HomePage"),
                RouteModel(path="/download", title="下载", icon="DownloadOutlined", perm="page:download", in_menu=True, sort_order=20, component="DownloadPage"),
                RouteModel(path="/market", title="任务市场", icon="AppstoreOutlined", perm="page:market", in_menu=True, sort_order=30, component="MarketPage"),
                RouteModel(path="/forum", title="论坛", icon="MessageOutlined", perm="page:forum", in_menu=True, sort_order=40, component="ForumPage"),
                RouteModel(path="/upload", title="上传", perm="page:upload", in_menu=False, sort_order=70, component="UploadPage"),
                RouteModel(path="/profile", title="个人中心", perm="page:profile", in_menu=False, sort_order=80, component="ProfilePage"),
                RouteModel(path="/user/:id", title="用户主页", perm="page:user", in_menu=False, sort_order=60, component="AuthorPage"),
                RouteModel(path="/notifications", title="通知", perm="page:notification", in_menu=False, sort_order=100, component="NotificationsPage"),
                RouteModel(path="/login", title="登录", perm="page:login", in_menu=False, sort_order=90, component="LoginPage"),
                RouteModel(path="/admin", title="管理", icon="SettingOutlined", in_menu=True, sort_order=110, component="AdminLayout"),
            ])
            await db.flush()

            # Admin parent
            admin_route = (await db.execute(
                select(RouteModel).where(RouteModel.path == "/admin")
            )).scalar_one()

            db.add_all([
                RouteModel(path="/admin/dashboard", title="仪表盘", icon="DashboardOutlined", parent_id=admin_route.id, perm="page:dashboard", in_menu=True, sort_order=10, component="DashboardPage"),
                RouteModel(path="/admin/users", title="用户管理", icon="UserOutlined", parent_id=admin_route.id, perm="page:admin-users", in_menu=True, sort_order=20, component="UsersPage"),
                RouteModel(path="/admin/roles", title="角色管理", icon="TeamOutlined", parent_id=admin_route.id, perm="page:admin-roles", in_menu=True, sort_order=30, component="RolesPage"),
                RouteModel(path="/admin/permissions", title="权限列表", icon="SafetyCertificateOutlined", parent_id=admin_route.id, perm="page:admin-perms", in_menu=True, sort_order=40, component="PermissionsPage"),
                RouteModel(path="/admin/versions", title="下载版本", icon="CloudDownloadOutlined", parent_id=admin_route.id, perm="page:admin-versions", in_menu=True, sort_order=50, component="VersionsPage"),
                RouteModel(path="/admin/tasks", title="任务管理", icon="AppstoreOutlined", parent_id=admin_route.id, perm="page:admin-tasks", in_menu=True, sort_order=60, component="TasksPage"),
                RouteModel(path="/admin/routes", title="路由管理", icon="NodeIndexOutlined", parent_id=admin_route.id, perm="page:admin-routes", in_menu=True, sort_order=70, component="RoutesPage"),
            ])
            await db.commit()
            print("基础路由已创建")
        else:
            print("路由已存在，跳过")


if __name__ == "__main__":
    asyncio.run(seed())
