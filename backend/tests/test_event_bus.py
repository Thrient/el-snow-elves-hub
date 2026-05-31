"""TDD: EventBus — RabbitMQ 发布/消费"""
import json
import asyncio
import pytest


class TestPublishConsume:
    """测试消息发布和消费的完整链路"""

    @pytest.mark.asyncio
    async def test_publish_and_consume_one_message(self):
        """发布一条审核消息，消费者收到正确的 type 和 id"""
        from app.infrastructure.EventBus import publish_review, consume_review

        received: list[dict] = []

        async def callback(data: dict):
            received.append(data)

        await consume_review(callback)
        await asyncio.sleep(0.5)  # 等待 consumer 注册完成

        await publish_review("post", 42)

        await asyncio.sleep(1.0)  # 等待消息投递

        assert len(received) == 1, f"Expected 1, got {len(received)}: {received}"
        assert received[0] == {"type": "post", "id": 42}

    @pytest.mark.asyncio
    async def test_publish_multiple_messages_ordered(self):
        """发布多条消息，消费者按顺序收到"""
        from app.infrastructure.EventBus import publish_review, consume_review

        received: list[dict] = []

        async def callback(data: dict):
            received.append(data)

        await consume_review(callback)

        await publish_review("post", 1)
        await publish_review("reply", 2)
        await publish_review("task", 3)

        await asyncio.sleep(2.0)

        assert len(received) == 3
        assert received[0]["type"] == "post"
        assert received[1]["type"] == "reply"
        assert received[2]["type"] == "task"

    @pytest.mark.asyncio
    async def test_message_contains_only_type_and_id(self):
        """消息格式严格为 {type, id}，无多余字段"""
        from app.infrastructure.EventBus import publish_review, consume_review

        received: list[dict] = []

        async def callback(data: dict):
            received.append(data)

        await consume_review(callback)

        await publish_review("comment", 99)

        await asyncio.sleep(2.0)

        assert len(received) == 1
        assert set(received[0].keys()) == {"type", "id"}
        assert received[0]["type"] == "comment"
        assert received[0]["id"] == 99
        assert isinstance(received[0]["id"], int)

    @pytest.mark.asyncio
    async def test_concurrent_publishes_are_serialized_by_lock(self):
        """并发 publish 不会因竞态丢失 — 所有发布都应成功"""
        from app.infrastructure.EventBus import publish_review, close_bus

        # 关闭连接模拟冷启动，触发 _get_channel 的创建路径
        await close_bus()

        # 10 个并发 publish — 都必须在锁保护下安全完成
        async def publish_one(i: int):
            await publish_review("post", i)

        # 不应抛异常
        await asyncio.gather(*[publish_one(i) for i in range(10)])

        # 连接创建成功
        from app.infrastructure.EventBus import _connection
        assert _connection is not None
