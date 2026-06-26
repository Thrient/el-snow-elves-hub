# SSE Redis Pub/Sub 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SSE 消息推送从内存队列遍历改为 Redis Pub/Sub，实现通用化的消息路由（不区分广播/通知/管理员），天然兼容未来分布式部署。

**Architecture:** `push()` 改为 `PUBLISH sse:msg`，新增后台 `_subscribe()` 任务监听 channel 并匹配本地 `_queues` 投递。删除 `is_admin` 概念和 `_broadcast_online_count()`，在线人数走通用 `push()` 流程。

**Tech Stack:** Python 3.13, redis.asyncio (aioredis), FastAPI lifespan

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/infrastructure/sse/PresenceTracker.py` | Modify | push → PUBLISH, 删除 _broadcast_online_count, 新增 _subscribe, add/remove 签名调整 |
| `backend/app/infrastructure/sse/Router.py` | Minor modify | 删除 is_admin 变量, add() 调用不再传 is_admin |
| `backend/app/scheduler/LifeSpan.py` | Modify | 启动/关闭 _subscribe 后台任务 |
| `backend/app/admin/Router.py` | 不动 | — |
| 前端所有文件 | 不动 | — |

**接口契约：**

```python
# push — 唯一对外发送接口
async def push(data: dict, *, user_id: int | None = None,
               client_type: str | None = None) -> None

# add — 注册连接
async def add(client_type: str, user_id: int) -> tuple[str, asyncio.Queue]

# remove — 注销连接
async def remove(client_id: str) -> None

# subscribe — 后台任务（lifespan 管理）
async def subscribe() -> None
```

---

### Task 1: 改造 `push()` — 从内存遍历改为 Redis PUBLISH

**Files:** Modify `backend/app/infrastructure/sse/PresenceTracker.py`

- [ ] **Step 1: 重写 `push()` 函数**

替换当前 L78-93：

```python
async def push(data: dict, *, user_id: int | None = None,
               client_type: str | None = None) -> None:
    """发送消息到 Redis Pub/Sub — 订阅端负责匹配本地队列投递"""
    r = _redis()
    msg = {"data": data}
    if user_id is not None:
        msg["user_id"] = user_id
    if client_type is not None:
        msg["client_type"] = client_type
    await r.publish("sse:msg", json.dumps(msg, ensure_ascii=False))
```

- [ ] **Step 2: 验证语法**

```bash
cd backend && PYTHONPATH=. python -c "from app.infrastructure.sse.PresenceTracker import push; print('push imported OK')"
```

Expected: `push imported OK`

---

### Task 2: 新增 `_subscribe()` 后台订阅任务

**Files:** Modify `backend/app/infrastructure/sse/PresenceTracker.py`

- [ ] **Step 1: 新增 `_deliver()` 辅助函数**

在 `push()` 之后添加：

```python
async def _deliver(msg: dict) -> None:
    """收到 Pub/Sub 消息后，匹配本地队列投递"""
    target_uid = msg.get("user_id")
    target_type = msg.get("client_type")
    data_str = json.dumps(msg["data"], ensure_ascii=False)

    async with _lock:
        items = list(_queues.items())

    r = _redis()
    for cid, q in items:
        # 匹配 user_id
        if target_uid is not None:
            try:
                c_uid = await r.hget(f"{KEY_PREFIX}{cid}", "user_id")
            except Exception:
                continue
            if c_uid != str(target_uid):
                continue

        # 匹配 client_type
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
```

- [ ] **Step 2: 新增 `subscribe()` 函数**

```python
async def subscribe() -> None:
    """后台任务：订阅 sse:msg channel，收到消息后匹配本地队列投递。
    由 FastAPI lifespan 启动/关闭。"""
    r = _redis()
    pubsub = r.pubsub()
    await pubsub.subscribe("sse:msg")

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
        await pubsub.unsubscribe("sse:msg")
```

- [ ] **Step 3: 验证新增函数可导入**

```bash
cd backend && PYTHONPATH=. python -c "from app.infrastructure.sse.PresenceTracker import subscribe, _deliver; print('subscribe imported OK')"
```

Expected: `subscribe imported OK`

---

### Task 3: 改造 `add()` — 删除 `is_admin`，用 `push()` 广播在线人数

**Files:** Modify `backend/app/infrastructure/sse/PresenceTracker.py`

- [ ] **Step 1: 修改 `add()` 签名和实现**

替换当前 L27-40：

```python
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
```

变化：
- 删除 `is_admin: bool` 参数
- Redis hash 不再存 `is_admin` 字段
- 替换 `await _broadcast_online_count(r)` → `await _notify_online_count()`

- [ ] **Step 2: 新增 `_notify_online_count()` 辅助函数**

在 `add()` 之前添加。文件顶部新增 import：
```python
from sqlalchemy import select
from app.infrastructure.Database import async_session
from app.identity.entity.User import User
from app.infrastructure.rbac.entity.Role import Role
from app.infrastructure.rbac.entity.Permission import Permission
```

```python
async def _get_admin_ids() -> list[int]:
    """查询所有拥有 dashboard:view 权限（含 * 通配）的用户 ID"""
    async with async_session() as db:
        result = await db.execute(
            select(User.id).distinct()
            .join(User.roles)
            .join(Role.permissions)
            .where(Permission.code.in_(["dashboard:view", "*"]))
        )
        return [row[0] for row in result.all()]


async def _notify_online_count() -> None:
    """在线人数变化时，查管理员 ID，逐条推给每个管理员"""
    counts_data = await counts()
    data = {"type": "online_count", **counts_data}
    admin_ids = await _get_admin_ids()
    for uid in admin_ids:
        await push(data, user_id=uid)
```

---

### Task 4: 改造 `remove()` — 用 `push()` 广播在线人数

**Files:** Modify `backend/app/infrastructure/sse/PresenceTracker.py`

- [ ] **Step 1: 修改 `remove()`**

替换当前 L43-48：

```python
async def remove(client_id: str) -> None:
    r = _redis()
    await r.delete(f"{KEY_PREFIX}{client_id}")
    async with _lock:
        _queues.pop(client_id, None)
    await _notify_online_count()
```

变化：替换 `await _broadcast_online_count(r)` → `await _notify_online_count()`

---

### Task 5: 删除 `_broadcast_online_count()` 函数

**Files:** Modify `backend/app/infrastructure/sse/PresenceTracker.py`

- [ ] **Step 1: 删除 L96-107 的 `_broadcast_online_count()` 整个函数**

确认函数已不再被任何地方调用。

- [ ] **Step 2: 验证**

```bash
cd backend && PYTHONPATH=. python -c "
from app.infrastructure.sse.PresenceTracker import add, remove, push, subscribe, counts
print('All imports OK')
"
```

Expected: `All imports OK`

---

### Task 6: 更新 `sse/Router.py` — 删除 `is_admin`

**Files:** Modify `backend/app/infrastructure/sse/Router.py`

- [ ] **Step 1: 删除 `is_admin` 相关代码**

L25-27 从：

```python
user_id = user.id if user else ANONYMOUS_USER_ID
is_admin = user.has_permission("dashboard:view") if user else False
client_id, queue = await presence_add(client, user_id, is_admin)
```

改为：

```python
user_id = user.id if user else ANONYMOUS_USER_ID
client_id, queue = await presence_add(client, user_id)
```

- [ ] **Step 2: 验证**

```bash
cd backend && PYTHONPATH=. python -c "from app.infrastructure.sse.Router import router; print('Router OK')"
```

Expected: `Router OK`

---

### Task 7: 在 Lifespan 中启动/关闭 `subscribe()`

**Files:** Modify `backend/app/scheduler/LifeSpan.py`

- [ ] **Step 1: 修改 lifespan**

```python
"""应用生命周期 — 启动 / 关闭定时任务 + AI 审核 Worker + SSE 订阅"""
from contextlib import asynccontextmanager
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from app.scheduler.Cleanup import daily_cleanup, daily_fingerprint_cleanup
from app.scheduler.ReviewWorker import start_worker, stop_worker
from app.infrastructure.sse.PresenceTracker import subscribe


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_cleanup, "cron", hour=0, minute=0)
    scheduler.add_job(daily_fingerprint_cleanup, "cron", hour=3, minute=0)
    scheduler.start()

    await start_worker()
    sub_task = asyncio.create_task(subscribe())

    try:
        yield
    finally:
        sub_task.cancel()
        try:
            await sub_task
        except asyncio.CancelledError:
            pass
        await stop_worker()
        scheduler.shutdown()
```

- [ ] **Step 2: 验证语法**

```bash
cd backend && PYTHONPATH=. python -c "from app.scheduler.LifeSpan import lifespan; print('lifespan OK')"
```

Expected: `lifespan OK`

---

### Task 8: 构建前端并验证

后端代码无语法错误后，构建前端确认无 TS 报错。

- [ ] **Step 1: 构建前端**

```bash
cd frontend && npm run build
```

Expected: `✓ built in ...`

- [ ] **Step 2: 检查完整文件**

最终 `PresenceTracker.py` 应包含以下公开符号：
`ANONYMOUS_USER_ID`, `add()`, `remove()`, `heartbeat()`, `counts()`, `push()`, `subscribe()`
内部辅助：`_notify_online_count()`, `_deliver()`, `_redis()`, `_queues`, `_lock`

**不包含**：`_broadcast_online_count`、硬编码的 `is_admin`
