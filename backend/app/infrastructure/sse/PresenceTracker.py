"""在线状态追踪器 — Redis 存 metadata，TTL 自动清理，key 即计数器。
消息推送走 Redis Pub/Sub 通用路由，天然兼容分布式部署。"""
from __future__ import annotations
import asyncio
import json
from uuid import uuid4

import redis.asyncio as aioredis
from sqlalchemy import select

from app.Config import settings
from app.infrastructure.Database import async_session
from app.identity.entity.User import User
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.Permission import Permission
from app.infrastructure.rbac.entity.UserRole import UserRole  # noqa: F401

ANONYMOUS_USER_ID = -1
KEY_PREFIX = "presence:"
TTL = 35

_redis_client: aioredis.Redis | None = None
_queues: dict[str, asyncio.Queue] = {}
_lock = asyncio.Lock()


def _redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


# ── 在线计数 ──────────────────────────────────

async def counts() -> dict[str, int]:
    """SCAN Redis presence:* key，统计 web/desktop 数量"""
    r = _redis()
    web = 0
    desktop = 0
    cursor = 0
    while True:
        cursor, keys = await r.scan(cursor, match=f"{KEY_PREFIX}*", count=200)
        for key in keys:
            cid = key[len(KEY_PREFIX):]
            if cid.startswith("count:") or ":" not in cid:
                continue
            ct = await r.hget(key, "type")
            if ct == "web":
                web += 1
            elif ct == "desktop":
                desktop += 1
        if cursor == 0:
            break
    return {"web": web, "desktop": desktop}


# ── 管理员查询 ────────────────────────────────

async def _get_admin_ids() -> list[int]:
    """拥有 dashboard:view 或 * 权限的用户 ID"""
    async with async_session() as db:
        result = await db.execute(
            select(User.id).distinct()
            .join(User.roles)
            .join(Role.permissions)
            .where(Permission.code.in_(["dashboard:view", "*"]))
        )
        return [row[0] for row in result.all()]


# ── 消息推送 (Pub/Sub) ─────────────────────────

CHANNEL = "sse:msg"


async def push(data: dict, *, user_id: int | None = None,
               client_type: str | None = None) -> None:
    """PUBLISH 到 Redis，订阅端负责匹配本地队列投递"""
    r = _redis()
    msg: dict = {"data": data}
    if user_id is not None:
        msg["user_id"] = user_id
    if client_type is not None:
        msg["client_type"] = client_type
    await r.publish(CHANNEL, json.dumps(msg, ensure_ascii=False))


async def _deliver(msg: dict) -> None:
    """收到 Pub/Sub 消息，匹配本地队列投递"""
    target_uid = msg.get("user_id")
    target_type = msg.get("client_type")
    data_str = json.dumps(msg["data"], ensure_ascii=False)

    async with _lock:
        items = list(_queues.items())

    r = _redis()
    for cid, q in items:
        if target_uid is not None:
            try:
                c_uid = await r.hget(f"{KEY_PREFIX}{cid}", "user_id")
            except Exception:
                continue
            if c_uid != str(target_uid):
                continue

        if target_type is not None:
            try:
                c_type = await r.hget(f"{KEY_PREFIX}{cid}", "type")
            except Exception:
                continue
            if c_type != target_type:
                continue

        try:
            q.put_nowait(data_str)
        except asyncio.QueueFull:
            pass


async def subscribe() -> None:
    """后台任务：订阅 sse:msg，收到消息投递到本地队列（lifespan 管理）"""
    r = _redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(CHANNEL)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                msg = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue
            await _deliver(msg)
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(CHANNEL)


# ── 在线人数通知 ──────────────────────────────

async def _notify_online_count() -> None:
    """计数 → 查管理员 → 逐条推送在线人数"""
    counts_data = await counts()
    data = {"type": "online_count", **counts_data}
    try:
        admin_ids = await _get_admin_ids()
    except Exception:
        return
    for uid in admin_ids:
        await push(data, user_id=uid)


# ── 连接生命周期 ──────────────────────────────

async def add(client_type: str, user_id: int) -> tuple[str, asyncio.Queue]:
    r = _redis()
    client_id = f"{client_type}:{uuid4()}"
    await r.hset(f"{KEY_PREFIX}{client_id}", mapping={
        "type": client_type,
        "user_id": str(user_id),
    })
    await r.expire(f"{KEY_PREFIX}{client_id}", TTL)
    async with _lock:
        q = asyncio.Queue()
        _queues[client_id] = q
    await _notify_online_count()
    return client_id, q


async def remove(client_id: str) -> None:
    r = _redis()
    try:
        await r.delete(f"{KEY_PREFIX}{client_id}")
    except BaseException:
        pass
    async with _lock:
        _queues.pop(client_id, None)
    # 独立的 task：SSE generator 被取消时 cancel scope 仍活跃，
    # await _notify_online_count() 会被 CancelledError 中断，
    # 必须脱离当前 scope 确保通知正常发送
    asyncio.create_task(_notify_online_count())


async def heartbeat(client_id: str) -> None:
    r = _redis()
    await r.expire(f"{KEY_PREFIX}{client_id}", TTL)
