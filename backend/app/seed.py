"""首次部署：建表 + 默认角色权限 + 管理员"""
import asyncio

from app.infrastructure.Database import engine, async_session, Base
from sqlalchemy import select, func, text
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.Permission import Permission
from app.infrastructure.rbac.entity.RolePermission import RolePermission
from app.infrastructure.navigation.entity.Route import Route as RouteModel
from app.infrastructure.navigation.SeedData import PERMISSION_CODES, PUBLIC_ROUTES, ADMIN_ROUTES
from app.forum.entity.ForumBoard import ForumBoard
from app.identity.entity.User import User
from app.infrastructure.rbac.entity.UserRole import UserRole
from app.infrastructure.security.Token import hash_password


ROLES = [
    {"name": "admin", "description": "超级管理员", "data_scope": "all"},
    {"name": "user", "description": "普通用户", "data_scope": "self"},
    {"name": "anonymous", "description": "匿名用户（未登录时的默认权限）", "data_scope": "self"},
    {"name": "ai-reviewer", "description": "AI 内容审核员", "data_scope": "all"},
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
        anon_perms = ["page:home", "page:download", "page:market", "page:forum", "page:login",
                     "page:user",
                     "ai:vision",
                     "auth:login", "auth:register", "auth:verify", "auth:send-verify",
                     "forum:boards", "forum:search", "forum:threads", "forum:view",
                     "task:list", "task:rankings", "task:user", "task:view", "task:comments", "task:download", "task:lookup",
                     "route:list",
                     "version:list", "version:download", "version:diff", "version:blob",
                     "public:ping", "presence:stream"]
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
        for code in ["page:profile", "page:user", "ai:vision", "auth:resend-verify",
                     "forum:post", "forum:reply", "forum:like",
                     "forum:update", "forum:delete",
                     "task:create", "task:like", "task:comment", "task:delete",
                     "comment:delete",
                     "file:check", "file:upload:init", "file:upload:chunk", "file:upload:complete", "file:upload:direct",
                     "notification:list", "notification:count", "notification:read", "notification:read-all",
                     "user:view", "user:update", "user:email", "user:downloads", "user:likes", "user:avatar"]:
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

        # ── AI reviewer role ──
        ai_reviewer_role = (await db.execute(
            select(Role).where(Role.name == "ai-reviewer")
        )).scalar_one()
        for code in ["review:list", "review:decide", "forum:boards", "forum:search",
                     "forum:threads", "forum:view", "task:list", "task:view", "task:comments"]:
            p = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one()
            existing = (await db.execute(
                select(RolePermission).where(
                    RolePermission.role_id == ai_reviewer_role.id,
                    RolePermission.permission_id == p.id,
                )
            )).scalar_one_or_none()
            if not existing:
                db.add(RolePermission(role_id=ai_reviewer_role.id, permission_id=p.id))
                print(f"ai-reviewer ← {code}")
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

        # ── AI reviewer user ──
        ai_user = (await db.execute(
            select(User).where(User.email == "ai-reviewer@elarion.cn")
        )).scalar_one_or_none()
        if not ai_user:
            ai_user = User(
                username="AI审核员",
                email="ai-reviewer@elarion.cn",
                password_hash=hash_password("AiReview2024!@#"),
            )
            db.add(ai_user)
            await db.flush()
            db.add(UserRole(user_id=ai_user.id, role_id=ai_reviewer_role.id))
            await db.commit()
            print("AI 审核员已创建")
        else:
            print("AI 审核员已存在，检查角色")
        if not (await db.execute(
            select(UserRole).where(
                UserRole.user_id == ai_user.id,
                UserRole.role_id == ai_reviewer_role.id,
            )
        )).scalar_one_or_none():
            db.add(UserRole(user_id=ai_user.id, role_id=ai_reviewer_role.id))
            await db.commit()
            print("AI 审核员角色已补全")

        # ── Forum boards ──
        for name, desc in [("综合讨论", "游戏相关自由讨论，畅所欲言"), ("问题反馈", "使用问题、Bug 反馈与功能建议")]:
            exists = (await db.execute(
                select(ForumBoard).where(ForumBoard.name == name)
            )).scalar_one_or_none()
            if not exists:
                db.add(ForumBoard(name=name, description=desc))
                await db.commit()
                print(f"板块已创建: {name}")
            else:
                print(f"板块已存在: {name}")

        # ── Routes ──
        route_count = (await db.execute(
            select(func.count(RouteModel.id))
        )).scalar() or 0

        if route_count == 0:
            # Public routes (from shared seed data)
            for r in PUBLIC_ROUTES:
                db.add(RouteModel(
                    path=r.path, title=r.title, icon=r.icon,
                    perm=r.perm, in_menu=r.in_menu,
                    sort_order=r.sort_order, component=r.component,
                ))
            await db.flush()

            # Admin parent
            admin_route = (await db.execute(
                select(RouteModel).where(RouteModel.path == "/admin")
            )).scalar_one()

            for r in ADMIN_ROUTES:
                db.add(RouteModel(
                    path=r.path, title=r.title, icon=r.icon,
                    parent_id=admin_route.id, perm=r.perm,
                    in_menu=r.in_menu, sort_order=r.sort_order,
                    component=r.component,
                ))
            await db.commit()
            print("基础路由已创建")
        else:
            print("路由已存在，跳过")

        # ── 兼容迁移: 旧列 ──
        from sqlalchemy import text as sql_text
        try:
            for sql in [
                "ALTER TABLE fingerprints ADD COLUMN detected_type VARCHAR(16) NULL",
                "ALTER TABLE forum_posts ADD COLUMN status VARCHAR(16) DEFAULT 'approved'",
                "ALTER TABLE forum_posts ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
                "ALTER TABLE comments ADD COLUMN status VARCHAR(16) DEFAULT 'approved'",
                "ALTER TABLE comments ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
                "ALTER TABLE tasks ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
            ]:
                try:
                    await db.execute(sql_text(sql))
                    await db.commit()
                except Exception:
                    await db.rollback()
            print("迁移: 兼容列已检查")
        except Exception:
            pass

        # ── 审核系统重构迁移 ──
        try:
            from sqlalchemy import inspect as sql_inspect
            inspector = sql_inspect(db.get_bind())
            existing_tables = inspector.get_table_names()

            if "review_records" not in existing_tables:
                await db.execute(sql_text("""
                    CREATE TABLE review_records (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        content_type VARCHAR(16) NOT NULL,
                        content_id INT NOT NULL,
                        reviewer_id INT NULL,
                        status VARCHAR(16) DEFAULT 'pending',
                        reason TEXT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_rt_s (content_type, status),
                        INDEX idx_rc (content_type, content_id),
                        FOREIGN KEY (reviewer_id) REFERENCES users(id)
                    )
                """))
                await db.commit()
                print("迁移: review_records 表已创建")
            else:
                print("迁移: review_records 表已存在")

            for table in ["forum_posts", "tasks", "comments"]:
                result = await db.execute(
                    sql_text(f"UPDATE {table} SET status = 'published' WHERE status = 'approved'")
                )
                if result.rowcount:
                    print(f"迁移: {table} 状态更新 {result.rowcount} 行")

            for table in ["forum_posts", "tasks", "comments"]:
                cols = [c["name"] for c in inspector.get_columns(table)]
                if "reviewed" in cols:
                    await db.execute(sql_text(f"ALTER TABLE {table} DROP COLUMN reviewed"))
                    await db.commit()
                    print(f"迁移: {table}.reviewed 列已删除")

            await db.commit()
            print("审核系统迁移完成")
        except Exception as e:
            await db.rollback()
            print(f"审核系统迁移: {e}")


if __name__ == "__main__":
    asyncio.run(seed())
