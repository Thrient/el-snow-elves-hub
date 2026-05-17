"""首次部署：建表 + 默认角色权限 + 管理员"""
import asyncio

from app.core.database import engine, async_session, Base
from app.core.security import hash_password
from app.models.user import User
from app.models.rbac import Permission, Role, PERMISSION_CODES
from app.models.download import DownloadVersion
import app.models  # noqa


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Add columns for existing databases (ignore if already present)
    async with engine.begin() as conn:
        for sql in [
            "ALTER TABLE tasks ADD COLUMN view_count INT DEFAULT 0",
            "ALTER TABLE download_records ADD COLUMN ip_address VARCHAR(45)",
            "ALTER TABLE forum_posts ADD COLUMN thread_id INT",
            "ALTER TABLE forum_posts ADD COLUMN like_count INT DEFAULT 0",
        ]:
            try:
                await conn.run_sync(lambda c, s=sql: c.exec_driver_sql(s))
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
        from sqlalchemy import select, func

        # ── Permissions ──
        for code, name in PERMISSION_CODES.items():
            existing = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one_or_none()
            if not existing:
                db.add(Permission(code=code, name=name))

        # Add wildcard super-admin permission
        wildcard = (await db.execute(select(Permission).where(Permission.code == "*"))).scalar_one_or_none()
        if not wildcard:
            db.add(Permission(code="*", name="超级管理员（全部权限）"))

        await db.flush()

        # ── Roles ──
        # Admin role — all permissions
        admin_role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one_or_none()
        if not admin_role:
            admin_role = Role(name="admin", description="管理员")
            db.add(admin_role)
            await db.flush()
            # Direct insert into join table (avoids async lazy load issue)
            from app.models.rbac import RolePermission
            all_perms = (await db.execute(select(Permission))).scalars().all()
            for p in all_perms:
                db.add(RolePermission(role_id=admin_role.id, permission_id=p.id))

        # User role — no special permissions
        user_role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one_or_none()
        if not user_role:
            user_role = Role(name="user", description="普通用户")
            db.add(user_role)

        await db.flush()

        # ── Admin user ──
        admin_user = (await db.execute(select(User).where(User.email == "admin@elsnow.com"))).scalar_one_or_none()
        if admin_user:
            admin_user.role_id = admin_role.id
        else:
            db.add(User(
                username="admin",
                email="admin@elsnow.com",
                password_hash=hash_password("Admin@123"),
                role_id=admin_role.id,
            ))
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

        await db.commit()
        print("Seed 完成")


if __name__ == "__main__":
    asyncio.run(seed())
