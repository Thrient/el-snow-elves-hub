"""首次部署：建表 + 默认角色权限 + 管理员 + 数据迁移"""

import asyncio
from sqlalchemy import select, func, update, delete

from app.core.database import engine, async_session, Base
from app.core.security import hash_password
from app.models.user import User
from app.models.rbac import Permission, Role, RolePermission, UserRole, PERMISSION_CODES, WILDCARD
from app.models.download import DownloadVersion
import app.models  # noqa


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add columns for existing databases
    async with engine.begin() as conn:
        for sql in [
            "ALTER TABLE tasks ADD COLUMN view_count INT DEFAULT 0",
            "ALTER TABLE download_records ADD COLUMN ip_address VARCHAR(45)",
            "ALTER TABLE forum_posts ADD COLUMN thread_id INT",
            "ALTER TABLE forum_posts ADD COLUMN like_count INT DEFAULT 0",
            "ALTER TABLE routes ADD COLUMN in_menu BOOL DEFAULT TRUE",
            "ALTER TABLE roles ADD COLUMN data_scope VARCHAR(16) DEFAULT 'all'",
        ]:
            try:
                await conn.run_sync(lambda c, s=sql: c.exec_driver_sql(s))
            except Exception:
                pass

        # Migrate user.role_id → user_roles (if column still exists)
        try:
            await conn.run_sync(lambda c: c.exec_driver_sql(
                "INSERT IGNORE INTO user_roles (user_id, role_id) "
                "SELECT id, role_id FROM users WHERE role_id IS NOT NULL"
            ))
        except Exception:
            pass

        # Fill thread_id for existing replies
        try:
            await conn.run_sync(lambda c: c.exec_driver_sql(
                "UPDATE forum_posts AS fp1 "
                "INNER JOIN forum_posts AS fp2 ON fp1.parent_id = fp2.id "
                "SET fp1.thread_id = COALESCE(fp2.thread_id, fp2.id) "
                "WHERE fp1.parent_id IS NOT NULL AND fp1.thread_id IS NULL"
            ))
        except Exception:
            pass

    async with async_session() as db:
        # ── Permissions: full refresh ──
        # Remove deprecated codes
        deprecated = {
            "admin.access", "admin.dashboard",
            "users.view", "users.manage",
            "roles.view", "roles.manage",
            "permissions.view", "permissions.manage",
            "routes.view", "routes.manage",
            "versions.view", "versions.manage",
            "tasks.view", "tasks.approve", "tasks.delete",
            "comments.delete",
            "forum.view", "forum.post", "forum.manage",
        }
        for code in deprecated:
            old = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one_or_none()
            if old:
                await db.execute(delete(RolePermission).where(RolePermission.permission_id == old.id))
                await db.delete(old)

        # Insert new codes
        for code, name in PERMISSION_CODES.items():
            existing = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one_or_none()
            if existing:
                existing.name = name
            else:
                db.add(Permission(code=code, name=name))

        # Wildcard
        wildcard = (await db.execute(select(Permission).where(Permission.code == WILDCARD))).scalar_one_or_none()
        if not wildcard:
            db.add(Permission(code=WILDCARD, name="超级管理员（全部权限）"))

        await db.flush()

        # ── Roles ──
        all_perms = (await db.execute(select(Permission))).scalars().all()
        all_perm_ids = [p.id for p in all_perms]

        admin_role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one_or_none()
        if not admin_role:
            admin_role = Role(name="admin", description="超级管理员")
            db.add(admin_role)
            await db.flush()
            for pid in all_perm_ids:
                db.add(RolePermission(role_id=admin_role.id, permission_id=pid))
        else:
            # Reconcile admin role perms: give all current perms
            existing_perms = (await db.execute(
                select(RolePermission).where(RolePermission.role_id == admin_role.id)
            )).scalars().all()
            existing_perm_ids = {rp.permission_id for rp in existing_perms}
            for p in all_perms:
                if p.id not in existing_perm_ids:
                    db.add(RolePermission(role_id=admin_role.id, permission_id=p.id))

        user_role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one_or_none()
        if not user_role:
            user_role = Role(name="user", description="普通用户", data_scope="self")
            db.add(user_role)

        anon_role = (await db.execute(select(Role).where(Role.name == "anonymous"))).scalar_one_or_none()
        if not anon_role:
            anon_role = Role(name="anonymous", description="匿名用户（未登录时的默认权限）", data_scope="self")
            db.add(anon_role)

        await db.flush()

        # ── Admin user ──
        admin_user = (await db.execute(select(User).where(User.email == "admin@elsnow.com"))).scalar_one_or_none()
        if admin_user:
            existing_ur = (await db.execute(
                select(UserRole).where(UserRole.user_id == admin_user.id, UserRole.role_id == admin_role.id)
            )).scalar_one_or_none()
            if not existing_ur:
                db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))
        else:
            db.add(User(
                username="admin",
                email="admin@elsnow.com",
                password_hash=hash_password("Admin@123"),
            ))
            await db.flush()
            new_admin = (await db.execute(
                select(User).where(User.email == "admin@elsnow.com")
            )).scalar_one()
            db.add(UserRole(user_id=new_admin.id, role_id=admin_role.id))
            print("已创建管理员: admin@elsnow.com / Admin@123")

        # ── Sample download version ──
        ver = (await db.execute(select(DownloadVersion).limit(1))).scalar_one_or_none()
        if not ver:
            db.add(DownloadVersion(version="7.0.0", platform="Windows x64", changelog="首个正式版本",
                                    file_url="/api/v1/files/7/download", is_latest=True))
            print("已创建示例版本 v7.0.0")

        # ── Forum boards ──
        from app.models.forum import ForumBoard
        board_count = (await db.execute(select(func.count(ForumBoard.id)))).scalar() or 0
        if board_count == 0:
            boards = [
                ForumBoard(name="综合讨论", description="游戏相关自由讨论，畅所欲言", sort_order=1),
                ForumBoard(name="问题反馈", description="使用问题、Bug 反馈与功能建议", sort_order=2),
            ]
            db.add_all(boards)
            print("已创建默认论坛板块")

        # ── Routes ──
        from app.models.route import Route as RouteModel
        route_count = (await db.execute(select(func.count(RouteModel.id)))).scalar() or 0
        if route_count == 0:
            top_routes = [
                RouteModel(path="/", title="首页", icon="HomeOutlined", in_menu=True, sort_order=10, component="HomePage"),
                RouteModel(path="/download", title="下载", icon="DownloadOutlined", in_menu=True, sort_order=20, component="DownloadPage"),
                RouteModel(path="/market", title="任务市场", icon="AppstoreOutlined", in_menu=True, sort_order=30, component="MarketPage"),
                RouteModel(path="/market/:id", title="任务详情", in_menu=False, sort_order=31, component="TaskDetailPage"),
                RouteModel(path="/forum", title="论坛", icon="MessageOutlined", in_menu=True, sort_order=40, component="ForumPage"),
                RouteModel(path="/forum/create", title="发帖", in_menu=False, sort_order=41, component="ForumCreatePage"),
                RouteModel(path="/forum/search", title="搜索", in_menu=False, sort_order=42, component="ForumSearchPage"),
                RouteModel(path="/forum/:boardId", title="板块", in_menu=False, sort_order=43, component="ForumBoardPage"),
                RouteModel(path="/forum/post/:threadId", title="帖子", in_menu=False, sort_order=44, component="ForumThreadPage"),
                RouteModel(path="/ranking", title="排行榜", in_menu=False, sort_order=50, component="RankingPage"),
                RouteModel(path="/user/:id", title="用户主页", in_menu=False, sort_order=60, component="AuthorPage"),
                RouteModel(path="/upload", title="上传", in_menu=False, sort_order=70, component="UploadPage"),
                RouteModel(path="/profile", title="个人中心", in_menu=False, sort_order=80, component="ProfilePage"),
                RouteModel(path="/login", title="登录", in_menu=False, sort_order=90, component="LoginPage"),
                RouteModel(path="/notifications", title="通知", in_menu=False, sort_order=100, component="NotificationsPage"),
                RouteModel(path="/admin", title="管理", icon="SettingOutlined", perm="admin:access", in_menu=True, sort_order=110, component="AdminLayout"),
            ]
            db.add_all(top_routes)
            await db.flush()

            admin_route = (await db.execute(
                select(RouteModel).where(RouteModel.path == "/admin")
            )).scalar_one()

            admin_children = [
                RouteModel(path="/admin/dashboard", title="仪表盘", icon="DashboardOutlined", parent_id=admin_route.id, in_menu=True, sort_order=10, component="DashboardPage"),
                RouteModel(path="/admin/users", title="用户管理", icon="UserOutlined", parent_id=admin_route.id, perm="user:list", in_menu=True, sort_order=20, component="UsersPage"),
                RouteModel(path="/admin/roles", title="角色管理", icon="TeamOutlined", parent_id=admin_route.id, perm="role:list", in_menu=True, sort_order=30, component="RolesPage"),
                RouteModel(path="/admin/permissions", title="权限列表", icon="SafetyCertificateOutlined", parent_id=admin_route.id, perm="perm:list", in_menu=True, sort_order=40, component="PermissionsPage"),
                RouteModel(path="/admin/versions", title="下载版本", icon="CloudDownloadOutlined", parent_id=admin_route.id, perm="version:list", in_menu=True, sort_order=50, component="VersionsPage"),
                RouteModel(path="/admin/tasks", title="任务管理", icon="AppstoreOutlined", parent_id=admin_route.id, perm="task:list", in_menu=True, sort_order=60, component="TasksPage"),
                RouteModel(path="/admin/routes", title="路由管理", icon="NodeIndexOutlined", parent_id=admin_route.id, perm="route:list", in_menu=True, sort_order=70, component="RoutesPage"),
            ]
            db.add_all(admin_children)
            await db.flush()
            print("已创建默认路由配置")
        else:
            # Update existing route perms
            from sqlalchemy import update as sa_update
            perm_map = {
                "/admin/dashboard": None,
                "/admin/users": "user:list",
                "/admin/roles": "role:list",
                "/admin/permissions": "perm:list",
                "/admin/versions": "version:list",
                "/admin/tasks": "task:list",
                "/admin/routes": "route:list",
            }
            for path, new_perm in perm_map.items():
                await db.execute(
                    sa_update(RouteModel).where(RouteModel.path == path).values(perm=new_perm)
                )
            await db.flush()
            print("已更新路由权限码")

            non_menu = [
                "/login", "/market/:id", "/forum/create", "/forum/search",
                "/forum/:boardId", "/forum/post/:threadId", "/ranking",
                "/user/:id", "/upload", "/profile", "/notifications",
            ]
            await db.execute(
                sa_update(RouteModel).where(RouteModel.path.in_(non_menu)).values(in_menu=False)
            )
            menu = ["/", "/download", "/market", "/forum", "/admin",
                    "/admin/dashboard", "/admin/users", "/admin/roles",
                    "/admin/permissions", "/admin/versions", "/admin/tasks", "/admin/routes"]
            await db.execute(
                sa_update(RouteModel).where(RouteModel.path.in_(menu)).values(in_menu=True)
            )
            print("已修复路由 in_menu 值")

        await db.commit()
        print("Seed 完成")


if __name__ == "__main__":
    asyncio.run(seed())
