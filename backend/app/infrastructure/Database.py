"""SQLAlchemy 异步引擎 + 会话工厂"""

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.Config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"init_command": "SET time_zone = '+08:00'"} if "sqlite" not in settings.database_url else {},
)


async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI 依赖注入：获取数据库会话"""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
