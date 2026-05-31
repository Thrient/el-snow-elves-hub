# Code Review — AI 审核事件队列 PR

> 2026-05-31 | 7 angles × 5 agents | 30+ candidates → 10 confirmed/plausible

---

## HIGH (6)

### 1. publish_review 在 db.commit() 后，MQ 故障导致 500 + 内容漏审

**File:** `forum/Router.py:207,258`, `task/Router.py:291,360`

4 个创建端点都先 `db.commit()` 再 `publish_review()`，没有 try/except。RabbitMQ 不可用时 MQ 抛异常 → 用户收到 500 → 以为没发成功重试 → 重复内容。且原内容已入库 `reviewed=False`，MQ 里没有事件 → 永久漏审。

**修复:** `publish_review()` 调用加 try/except，MQ 失败时记录日志但不影响用户响应。

### 2. EventBus _get_channel() TOCTOU 竞态

**File:** `infrastructure/EventBus.py:16-26`

```python
if _channel is None or _channel.is_closed:
    _connection = await aio_pika.connect(...)
    _channel = await _connection.channel()
```

两个协程同时通过 `is None` 检查 → 各自建连接 → 后者覆盖全局变量 → 前者的连接泄漏，无法被 `close_bus()` 关闭。

**修复:** 加 `asyncio.Lock` 保护。

### 3. 审核提交和通知提交是两次事务

**File:** `admin/Router.py:309+320, 381+393, 412+423`

三个审核端点都是先 `commit()` 状态变更，再加通知记录，再 `commit()`。第二次 commit 失败 → 审核已生效但通知丢失，作者永远不知道被拒。

**修复:** 两次 commit 合并为一次，或把通知写入和状态变更放在同一个事务里。

### 4. Ollama 不可用时消息被 ACK 丢失

**File:** `scheduler/ReviewWorker.py` `_handle_message` 中的 `return`

Worker 收到消息 → Ollama 挂了 → `ai_review_text` 返回 `pass=None` → `_handle_message` 直接 `return` → `message.process()` 自动 ACK → 消息从队列删除，永不重试。

**修复:** `pass=None` 时不 ack，或用 `message.nack(requeue=True)`。

### 5. Worker 在 HTTP 服务启动前就开始消费

**File:** `scheduler/LifeSpan.py`

`await start_worker()` 在 lifespan `yield` 之前调用 → RabbitMQ consumer 已注册 → 如果队列有积压消息 → Worker 收到并调 `http://localhost:8000/api/v1/...` → FastAPI 还没开始监听 → Connection Refused → 消息丢失。

**修复:** `start_worker()` 移到 `yield` 之后，或 worker 等待 HTTP 就绪再消费。

### 6. 无兜底扫描机制

**文件:** 删除的 `AiReview.py`，新增的 `ReviewWorker.py`

旧代码每 5 分钟扫描所有 `reviewed=False` 记录。新代码只处理 MQ 事件。内容在以下场景永久漏审：
- deploy 前创建的内容（无 MQ 事件）
- MQ 宕机时创建的内容（发布失败无重试）
- MQ 消息丢失（如本 PR #4 所述场景）

**修复:** 加一个低频（如每 30 分钟）的 DB 兜底扫描，或部署前跑一次手动 catch-up。

---

## MEDIUM (4)

### 7. 401 恢复前就弹错误 toast

**File:** `frontend/src/api/axios.ts:18-19`

`app:error` emit 移到 401 分支之前 → token 过期时先弹 "请求错误" toast → 再 refresh 成功 → 重试成功。用户看到假错误。

**修复:** 401 不 emit error，或由 `app:expired` 接管提示。

### 8. Login 422 语义错误，破坏限流

**File:** `identity/Router.py:125,132`

密码错误返回 422（Unprocessable Entity）而非 401（Unauthorized）。422 语义是"请求体格式错误"，不是"凭证无效"。网关/限流中间件通常基于 401 计数做暴力破解防护，换成 422 后这些防护失效。

**修复:** 保持 401，前端 axios 用 URL 跳过 login 的 refresh 逻辑（上一个方案），或其他区分机制。

### 9. 测试用例消费者累积导致 flaky

**File:** `tests/test_event_bus.py`

每个测试 `consume_review()` 都注册新 consumer，不取消。RabbitMQ 按 round-robin 分发 → 第二个测试的断言收到随机数量的消息。

**修复:** 每个测试后取消 consumer，或用独立队列名。

### 10. 未知消息类型静默丢弃

**File:** `scheduler/ReviewWorker.py:_handle_message`

`if/elif` 链没有 `else` → 拼写错误或新增类型 → 函数静默返回 → 消息被 ACK 丢弃 → 无日志告警。

**修复:** 加 `else: print(f"Unknown review type: {type_}")`。
