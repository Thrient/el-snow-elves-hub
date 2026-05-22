"""在线客户端追踪器 — SSE 连接计数 + 广播"""
import asyncio
import json
from collections import defaultdict

# {client_type: {client_id: 1}}
_streams: dict[str, dict[str, int]] = defaultdict(dict)
_admin_queues: list[asyncio.Queue] = []
_lock = asyncio.Lock()


async def connect(client_type: str) -> tuple[str, asyncio.Queue]:
    """客户端连接。返回 (client_id, queue)。"""
    client_id = f"{client_type}_{id(asyncio.current_task())}"
    async with _lock:
        _streams[client_type][client_id] = 1
        await _broadcast_locked()
    q: asyncio.Queue = asyncio.Queue()
    return client_id, q


async def disconnect(client_type: str, client_id: str):
    """客户端断开。"""
    async with _lock:
        _streams[client_type].pop(client_id, None)
        if not _streams[client_type]:
            del _streams[client_type]
        await _broadcast_locked()


async def _broadcast_locked():
    """必须在持有 _lock 时调用。推送在线数到所有 admin 队列。"""
    data = json.dumps({"type": "online_count", **counts_locked()})
    for q in _admin_queues:
        await q.put(data)


def counts_locked() -> dict[str, int]:
    """必须在持有 _lock 时调用。返回 {client_type: count}。"""
    return {t: len(clients) for t, clients in _streams.items()}


def counts() -> dict[str, int]:
    """线程安全地获取当前在线数（用于 REST 端点）。"""
    return {t: len(clients) for t, clients in _streams.items()}


def admin_queues_list() -> list[asyncio.Queue]:
    return _admin_queues
