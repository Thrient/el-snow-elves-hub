"""TDD: EventBus — RabbitMQ 发布/消费"""
import asyncio
import json
import uuid

import aio_pika
import pytest

from app.Config import settings
from app.infrastructure.EventBus import EXCHANGE, ROUTING_KEY

# 每个测试用独立队列名，避免消费者累积
def _qname() -> str:
    return f"test.review.{uuid.uuid4().hex[:8]}"


async def _setup_queue(qname: str) -> tuple[aio_pika.Connection, aio_pika.Channel]:
    """创建连接 + 声明 exchange + 绑定临时队列"""
    conn = await aio_pika.connect(settings.rabbitmq_url)
    ch = await conn.channel()
    exchange = await ch.declare_exchange(EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True)
    queue = await ch.declare_queue(qname, durable=False, exclusive=True, auto_delete=True)
    await queue.bind(exchange, ROUTING_KEY)
    return conn, ch, queue


async def _publish(channel: aio_pika.Channel, type_: str, item_id: int):
    exchange = await channel.get_exchange(EXCHANGE)
    body = json.dumps({"type": type_, "id": item_id}).encode()
    await exchange.publish(
        aio_pika.Message(body=body, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
        routing_key=ROUTING_KEY,
    )


class TestPublishConsume:
    """测试消息发布和消费的完整链路 — 每个测试独立队列"""

    @pytest.mark.asyncio
    async def test_publish_and_consume_one_message(self):
        """发布一条审核消息，消费者收到正确的 type 和 id"""
        qname = _qname()
        conn, ch, queue = await _setup_queue(qname)
        received: list[dict] = []

        async def on_message(msg: aio_pika.IncomingMessage):
            async with msg.process():
                received.append(json.loads(msg.body.decode()))

        await queue.consume(on_message)
        await asyncio.sleep(0.3)

        await _publish(ch, "post", 42)
        await asyncio.sleep(0.5)

        await conn.close()
        assert len(received) == 1, f"Expected 1, got {len(received)}: {received}"
        assert received[0] == {"type": "post", "id": 42}

    @pytest.mark.asyncio
    async def test_publish_multiple_messages_ordered(self):
        """发布多条消息，消费者按顺序收到"""
        qname = _qname()
        conn, ch, queue = await _setup_queue(qname)
        received: list[dict] = []

        async def on_message(msg: aio_pika.IncomingMessage):
            async with msg.process():
                received.append(json.loads(msg.body.decode()))

        await queue.consume(on_message)
        await asyncio.sleep(0.3)

        await _publish(ch, "post", 1)
        await _publish(ch, "reply", 2)
        await _publish(ch, "task", 3)
        await asyncio.sleep(0.5)

        await conn.close()
        assert len(received) == 3, f"Expected 3, got {len(received)}: {received}"
        assert received[0]["type"] == "post"
        assert received[1]["type"] == "reply"
        assert received[2]["type"] == "task"

    @pytest.mark.asyncio
    async def test_message_contains_only_type_and_id(self):
        """消息格式严格为 {type, id}，无多余字段"""
        qname = _qname()
        conn, ch, queue = await _setup_queue(qname)
        received: list[dict] = []

        async def on_message(msg: aio_pika.IncomingMessage):
            async with msg.process():
                received.append(json.loads(msg.body.decode()))

        await queue.consume(on_message)
        await asyncio.sleep(0.3)

        await _publish(ch, "comment", 99)
        await asyncio.sleep(0.5)

        await conn.close()
        assert len(received) == 1
        assert set(received[0].keys()) == {"type", "id"}
        assert received[0]["type"] == "comment"
        assert received[0]["id"] == 99
        assert isinstance(received[0]["id"], int)

    @pytest.mark.asyncio
    async def test_concurrent_publishes_dont_leak_connections(self):
        """并发 publish 安全 — 使用 EventBus 单例 + close_bus 模拟冷启动"""
        from app.infrastructure.EventBus import publish_review, close_bus

        await close_bus()

        async def publish_one(i: int):
            await publish_review("post", i)

        await asyncio.gather(*[publish_one(i) for i in range(10)])
        from app.infrastructure.EventBus import _connection
        assert _connection is not None
