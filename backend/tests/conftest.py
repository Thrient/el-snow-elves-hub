pytest_plugins = ("pytest_asyncio",)

import pytest


@pytest.fixture(autouse=True)
def _env_rabbitmq(monkeypatch):
    """测试用 RabbitMQ 连接（NAS 上已启动的容器）"""
    monkeypatch.setenv(
        "RABBITMQ_URL",
        "amqp://elsnow:MqPass2024%21%40%23@192.168.3.21:5672/",
    )


@pytest.fixture(autouse=True)
async def _cleanup_event_bus():
    """每个测试后关闭 RabbitMQ 连接"""
    yield
    try:
        from app.infrastructure.EventBus import close_bus
        await close_bus()
    except Exception:
        pass
