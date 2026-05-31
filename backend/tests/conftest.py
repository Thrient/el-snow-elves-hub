pytest_plugins = ("pytest_asyncio",)

import pytest
import pytest_asyncio


@pytest.fixture(autouse=True)
def _env_rabbitmq():
    """测试用 RabbitMQ 连接（NAS 上的 rabbitmq 容器）—— 必须在 EventBus import 之前执行"""
    import os
    os.environ["RABBITMQ_URL"] = "amqp://elsnow:MqSnowElf2024@192.168.3.21:5672/"


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_event_bus(_env_rabbitmq):
    """每个测试前清队列 + 重置连接，测试后关闭"""
    try:
        from app.infrastructure.EventBus import close_bus, _get_channel, QUEUE
        await close_bus()
        ch = await _get_channel()
        q = await ch.get_queue(QUEUE)
        await q.purge()
        await close_bus()
    except Exception:
        pass
    yield
    try:
        from app.infrastructure.EventBus import close_bus
        await close_bus()
    except Exception:
        pass
