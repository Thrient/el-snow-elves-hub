pytest_plugins = ("pytest_asyncio",)

import pytest
import pytest_asyncio


def pytest_configure(config):
    """在 pytest 收集测试前设置必要的环境变量"""
    import os
    os.environ.setdefault("RABBITMQ_URL", "amqp://elsnow:MqSnowElf2024@192.168.3.21:5672/")
    os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-only")
    os.environ.setdefault("DATABASE_URL", "mysql+aiomysql://test:test@localhost:3306/test_db")
    os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-tests-only")


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_bus():
    """每个测试后关闭 EventBus 单例连接"""
    yield
    try:
        from app.infrastructure.EventBus import close_bus
        await close_bus()
    except Exception:
        pass
