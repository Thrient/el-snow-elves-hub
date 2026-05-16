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

    async with async_session() as db:
        from sqlalchemy import select

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
                                    file_url="/downloads/elves-7.0.0-x64.zip", is_latest=True))
            print("已创建示例版本 v7.0.0")

        await db.commit()
        print("Seed 完成")


if __name__ == "__main__":
    asyncio.run(seed())
