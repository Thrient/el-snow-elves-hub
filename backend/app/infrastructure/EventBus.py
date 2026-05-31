"""RabbitMQ 事件总线 — 连接管理 + 发布/消费"""
import json
from typing import Callable, Awaitable

import aio_pika
from app.Config import settings

_connection: aio_pika.RobustConnection | None = None
_channel: aio_pika.RobustChannel | None = None

EXCHANGE = "review.exchange"
QUEUE = "review.queue"
ROUTING_KEY = "review.new"


async def _get_channel() -> aio_pika.RobustChannel:
    global _connection, _channel
    if _channel is None or _channel.is_closed:
        _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        _channel = await _connection.channel()
        exchange = await _channel.declare_exchange(
            EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
        )
        queue = await _channel.declare_queue(QUEUE, durable=True)
        await queue.bind(exchange, ROUTING_KEY)
    return _channel


async def publish_review(type_: str, item_id: int):
    """生产者：发布审核任务到 RabbitMQ"""
    channel = await _get_channel()
    exchange = await channel.get_exchange(EXCHANGE)
    body = json.dumps({"type": type_, "id": item_id}).encode()
    await exchange.publish(
        aio_pika.Message(body=body, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
        routing_key=ROUTING_KEY,
    )


async def consume_review(callback: Callable[[dict], Awaitable[None]]):
    """消费者：注册回调，有新消息时调用 callback(data)"""
    channel = await _get_channel()
    queue = await channel.get_queue(QUEUE)

    async def on_message(message: aio_pika.IncomingMessage):
        async with message.process():
            try:
                data = json.loads(message.body.decode())
                await callback(data)
            except Exception as e:
                print(f"EventBus consume error: {e}")

    await queue.consume(on_message)


async def close_bus():
    """关闭 RabbitMQ 连接"""
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _channel = None
    _connection = None
