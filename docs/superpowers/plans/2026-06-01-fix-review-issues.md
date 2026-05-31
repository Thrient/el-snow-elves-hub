# Code Review 修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 AI 审核事件队列 PR 的 10 个审查发现问题，不破坏现有功能。

**Architecture:** 每个修复独立、可单独验证。TDD 方式：先写失败测试，再改代码。

---

## 功能影响分析

| # | 修复 | 影响的功能 | 如何避免 |
|---|------|-----------|---------|
| 1 | publish_review 加 try/except | 创建帖子/回复/任务/评论 | 只 catch MQ 连接异常，不影响响应，内容已入库 |
| 2 | EventBus 加 asyncio.Lock | publish/consume | Lock 保护创建逻辑，已存在的 channel 无锁开销 |
| 3 | 两次 commit 合并 | 审核通知 | 通知和状态在同一个事务中，不会部分成功 |
| 4 | pass=None 时 nack | Ollama 不可用时 | 消息重回队列，下次 Worker 循环重试 |
| 5 | Worker 延迟启动 | 服务启动 | 只加 3 秒 sleep，不改变消费逻辑 |
| 6 | 启动时兜底扫描 | 启动时 | 一次性 DB 扫描，只处理 reviewed=False 的记录 |
| 7 | 401 不弹 toast | 所有 API 调用 | 401 由 refresh/auth:expired 处理，不重复弹 |
| 8 | Login 回退 401 | 登录 | 回退状态码，前端 skipUrls 过滤 login |
| 9 | 测试 consumer 清理 | 测试 | 每个测试取消 consumer 或独立队列 |
| 10 | 未知类型日志告警 | Worker | 只加 else 分支 print，不影响已知类型 |

---

### Task 1: publish_review 异常保护

**Files:** `forum/Router.py:206-207,257-258`, `task/Router.py:290-291,359-360`

**现状:** publish_review 在 db.commit() 后调用，无异常处理。MQ 故障 → 500。

**修复:** 包 try/except，MQ 失败时打日志但不影响用户响应。内容已入库，兜底扫描（Task 6）会捡起来。

4 处调用统一改法：

```python
# 改前：
await publish_review("post", p.id)

# 改后：
try:
    await publish_review("post", p.id)
except Exception as e:
    print(f"Failed to enqueue review: {e}")
```

- [ ] 4 处各加 try/except
- [ ] 复用顶层 import（把函数体内的 `from app.infrastructure.EventBus import publish_review` 移到文件顶部）
- [ ] Commit

---

### Task 2: EventBus _get_channel() 加锁

**Files:** `infrastructure/EventBus.py`

**现状:** `if _channel is None` 检查无锁保护，两协程同时进入 → 连接泄漏。

**修复:** 加 `asyncio.Lock`，锁在 check-then-create 操作上。正常路径（channel 已存在）无锁开销。

```python
import asyncio

_lock = asyncio.Lock()
_connection: aio_pika.Connection | None = None
_channel: aio_pika.Channel | None = None

async def _get_channel() -> aio_pika.Channel:
    global _connection, _channel
    if _channel is None or _channel.is_closed:
        async with _lock:
            # 双重检查 — 锁内再次判断，避免重复创建
            if _channel is None or _channel.is_closed:
                _connection = await aio_pika.connect(settings.rabbitmq_url)
                _channel = await _connection.channel()
                exchange = await _channel.declare_exchange(
                    EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
                )
                queue = await _channel.declare_queue(QUEUE, durable=True)
                await queue.bind(exchange, ROUTING_KEY)
    return _channel
```

- [ ] 加 `import asyncio`
- [ ] 加 `_lock = asyncio.Lock()`
- [ ] `_get_channel` 双重检查加锁
- [ ] 运行 `pytest tests/test_event_bus.py -v` 确认通过
- [ ] Commit

---

### Task 3: 审核 + 通知合并为一个事务

**Files:** `admin/Router.py` — `update_task_status`, `review_post`, `review_comment`

**现状:** 第一次 commit 保存审核状态 → 第二次 commit 保存通知。第二次失败 → 通知丢失。

**修复:** 先做状态变更 + 通知创建，最后一次性 commit。三个函数统一模式：

```python
# update_task_status — 改前：
async def update_task_status(...):
    ...
    t.status = body.status
    t.reviewed = True
    await db.commit()          # ← 第一次 commit
    
    if body.status == "rejected" and t.author_id:
        from app.notification.Router import create_notification
        ...
        await db.commit()      # ← 第二次 commit

# 改后：
async def update_task_status(...):
    ...
    t.status = body.status
    t.reviewed = True
    
    if body.status == "rejected" and t.author_id:
        from app.notification.Router import create_notification
        ...
        # 不单独 commit，和状态一起提交

    await db.commit()          # ← 唯一一次 commit
```

注意：`create_notification` 内部做 `db.flush()`，flush 只是把 SQL 发出去，不提交事务。所以把 commit 移到通知创建之后即可。

- [ ] 修改 `update_task_status`：删除第一个 commit，保留第二个
- [ ] 修改 `review_post`：同上
- [ ] 修改 `review_comment`：同上
- [ ] Commit

---

### Task 4: Ollama 不可用时消息 nack 回队

**Files:** `scheduler/ReviewWorker.py` — `_handle_message`
**Files:** `infrastructure/EventBus.py` — `on_message`

**现状:** `_handle_message` 中 `pass=None` 时直接 return → `message.process()` 自动 ACK → 消息丢失。

**修复思路:** `pass=None` 时抛异常 → `message.process()` 自动 nack(requeue=True) → 消息回到队列。

需要改两处：

**EventBus.py `on_message` — 去掉内部的 try/except，让异常透传给 `message.process()`：**

```python
async def on_message(message: aio_pika.IncomingMessage):
    async with message.process():
        data = json.loads(message.body.decode())
        await callback(data)
```

`message.process()` 退出时：若抛异常 → nack(requeue=True)；若正常返回 → ack。

**ReviewWorker.py `_handle_message` — pass=None 时抛异常：**

```python
result = await ai_review_text(text, images)
if result["pass"] is None:
    raise RuntimeError(f"AI unavailable for {type_} #{item_id}")
```

三个分支（post/reply、task、comment）统一样式。

- [ ] EventBus on_message 去 try/except
- [ ] _handle_message 三个分支 pass=None → raise
- [ ] Commit

---

### Task 5: Worker 延迟启动，等待 HTTP 就绪

**Files:** `scheduler/ReviewWorker.py` — `start_worker`

**现状:** `start_worker()` 立即 `consume_review()`，此时 lifespan 未 yield，HTTP 未监听。

**修复:** consume 前 sleep 3 秒即可。

```python
async def start_worker():
    await asyncio.sleep(3)  # 等待 HTTP server 就绪
    backoff = 1
    while True:
        try:
            await consume_review(_handle_message)
            print("AI review worker: started")
            return
        except Exception as e:
            print(f"AI review worker: waiting for RabbitMQ... ({e})")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
```

- [ ] `start_worker` 开头加 `await asyncio.sleep(3)`
- [ ] Commit

---

### Task 6: 启动时兜底扫描 unreviewed 内容

**Files:** `scheduler/ReviewWorker.py` — `start_worker`

**现状:** MQ 宕机期间创建的内容永久漏审，deploy 前的内容也没有事件。

**修复:** `start_worker()` 中，在开始消费之前，做一次性 DB 扫描。找到所有 `reviewed=False` 的记录，入队。

```python
async def _catch_up_unreviewed():
    """一次性扫描：把漏审的内容重新入队"""
    from app.infrastructure.EventBus import publish_review
    async with async_session() as db:
        # 帖子
        posts = (await db.execute(
            select(ForumPost).where(ForumPost.reviewed == False)
        )).scalars().all()
        for p in posts:
            is_thread = p.thread_id is None
            await publish_review("post" if is_thread else "reply", p.id)
        # 任务
        tasks = (await db.execute(
            select(TaskModel).where(TaskModel.reviewed == False)
        )).scalars().all()
        for t in tasks:
            await publish_review("task", t.id)
        # 评论
        comments = (await db.execute(
            select(Comment).where(Comment.reviewed == False)
        )).scalars().all()
        for c in comments:
            await publish_review("comment", c.id)
    print(f"AI review catch-up: {len(posts)} posts, {len(tasks)} tasks, {len(comments)} comments")
```

`start_worker` 中 HTTP sleep 之后、consume 之前调用：

```python
async def start_worker():
    await asyncio.sleep(3)
    await _catch_up_unreviewed()  # 兜底扫描
    # ... 然后 consume ...
```

- [ ] 实现 `_catch_up_unreviewed()`
- [ ] `start_worker` 中调用
- [ ] Commit

---

### Task 7: 401 不弹假错误 toast

**Files:** `frontend/src/api/axios.ts`

**现状:** `app:error` 在 401 判断前就 emit，导致 token 刷新成功时仍弹 "请求错误"。

**修复:** `app:error` 放回非 401 分支。login/register 的 422 走 else 弹 toast（正常），业务 401 由 refresh/auth:expired 接管。

```typescript
    if (status === 401) {
      if (err.config?.url === "/api/v1/auth/refresh") {
        bus.emit("auth:expired");
        return Promise.reject(err);
      }
      // ... refresh 逻辑 ...
      bus.emit("auth:expired");
    } else {
      const msg = err.response?.data?.message || `请求错误 (${status})`;
      bus.emit("app:error", msg);
    }
```

- [ ] `app:error` emit 移回 else 分支
- [ ] Commit

---

### Task 8: Login 回退 401

**Files:** `identity/Router.py:125,132`

**现状:** 登录失败返回 422，但 422 语义是"请求体格式错"，且暴力破解限流基于 401 计数。

**修复:** 回退为 401，前端 axios 加 `skipUrls` 过滤 login/register（这两个端点的 401 不触发 refresh）。

```python
# identity/Router.py — 回退
raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")
```

```typescript
// axios.ts — 401 分支开头
const skipUrls = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"];
if (skipUrls.some(u => err.config?.url === u)) {
  if (err.config?.url === "/api/v1/auth/refresh") bus.emit("auth:expired");
  // login/register 的 401: 直接 reject，由调用方处理（ErrorToast 不弹因为 app:error 在 else）
  return Promise.reject(err);
}
```

注意和 Task 7 配合：Task 7 把 `app:error` 放回了 else → login 的 401 不弹 toast。但登录页面需要显示错误。登页面已经有自己的错误处理（`catch { /* ErrorToast */ }`），而 ErrorToast 只监听 `app:error`... 

等一等。login.tsx 里：
```tsx
catch { /* ErrorToast */ }
```
它期望 ErrorToast 显示错误。但 Task 7 + Task 8 之后，login 401 既不触发 refresh 也不 emit app:error → ErrorToast 不显示。

**必须特殊处理：** login/register 的 401 也要 emit error：

```typescript
if (skipUrls.some(u => err.config?.url === u)) {
  if (err.config?.url === "/api/v1/auth/refresh") bus.emit("auth:expired");
  // login/register 的 401/422: 显示错误消息给用户
  const msg = err.response?.data?.message || `请求错误 (${status})`;
  bus.emit("app:error", msg);
  return Promise.reject(err);
}
```

- [ ] identity/Router.py 回退 401
- [ ] axios.ts skipUrls + login/register emit error
- [ ] 测试：登录输错密码 → 显示 "邮箱或密码错误"
- [ ] Commit

---

### Task 9: 测试 Consumer 清理

**Files:** `tests/test_event_bus.py`, `tests/conftest.py`

**现状:** 每个测试注册新 consumer 不取消，消息 round-robin 分发使断言 flaky。

**修复:** 每个测试用独立的队列名，测试结束后销毁。

在 conftest.py 加一个辅助函数：

```python
# conftest.py
import uuid

@pytest.fixture
async def review_queue():
    """每个测试一个独立队列，避免消费者累积"""
    from app.infrastructure.EventBus import _get_channel
    channel = await _get_channel()
    qname = f"review.test.{uuid.uuid4().hex[:8]}"
    exchange = await channel.get_exchange("review.exchange")
    queue = await channel.declare_queue(qname, durable=False, auto_delete=True)
    await queue.bind(exchange, "review.new")
    yield qname
    await queue.delete()
```

测试改用 `review_queue` fixture，publish 到同一个 exchange routing key，consume 用自己的队列名。

或者更简单的方案：测试后确保 cancel consumer。当前 `_cleanup_event_bus` fixture 只关连接，consumer 随连接一起销毁 —— 应该是有效的。问题可能是 autouse 时序问题。

**最简方案：** 把 `_cleanup_event_bus` 的 scope 改为 function（默认已是），并确认它确实在每个测试后运行。测试失败通常是 `autouse=True` 的 async fixture teardown 在 pytest-asyncio 中的行为问题。

改为使用 `@pytest_asyncio.fixture`：

```python
import pytest_asyncio

@pytest_asyncio.fixture(autouse=True)
async def _cleanup_event_bus():
    yield
    from app.infrastructure.EventBus import close_bus
    await close_bus()
```

- [ ] 改 `@pytest.fixture` → `@pytest_asyncio.fixture`
- [ ] 跑 `pytest tests/test_event_bus.py -v --count=5` 验证无 flaky
- [ ] Commit

---

### Task 10: 未知消息类型告警

**Files:** `scheduler/ReviewWorker.py` — `_handle_message`

**现状:** if/elif 链无 else，拼写错误或新类型静默丢弃。

**修复:** 加 else 分支打日志：

```python
    elif type_ == "comment":
        ...
    else:
        print(f"AI review worker: unknown type '{type_}' id={item_id}, skipped")
```

- [ ] 加 else 分支
- [ ] Commit

---

## 执行顺序

```
Task 2 (锁) → Task 4 (nack) → Task 5 (延迟) → Task 6 (兜底扫描)
     ↓              ↓
Task 1 (异常保护) Task 3 (合并事务)
                                        ↓
                              Task 7 (401 toast) → Task 8 (login 401)
                              Task 9 (测试修复) → Task 10 (else 告警)
```

Tasks 2+4+5+6 共享 ReviewWorker/EventBus 文件，一起做。Tasks 7+8 共享 axios/identity 文件，一起做。
