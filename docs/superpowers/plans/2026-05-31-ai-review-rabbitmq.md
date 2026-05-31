# AI 审核事件队列（RabbitMQ）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用 RabbitMQ 驱动 AI 内容审核。MQ 仅 AI 消费，人工审核保持现有页面操作方式。两者共享同一管理审核接口，拒绝时发站内通知给作者。

**Architecture:**

```
人工审核（不变）:
  管理员 → 管理页面浏览 → 点击审核 → PUT /admin/{type}/{id}/review → DB + 通知

AI 审核（新增）:
  用户发内容 → Router → DB → publish MQ → Worker consume → Ollama
                                    ↘ PUT /admin/{type}/{id}/review → DB + 通知
                                               ↑ 共用同一接口
```

**Tech:** FastAPI, RabbitMQ 4-alpine, aio-pika, Ollama minicpm-v:8b

---
## 文件变更

| 文件 | 操作 | 职责 |
|------|------|------|
| `docker-compose.yml` | 修改 | 加 rabbitmq |
| `backend/.env.prod` | 修改 | 加 RABBITMQ_URL |
| `backend/requirements.txt` | 修改 | 加 aio-pika |
| `backend/app/Config.py` | 修改 | 加 rabbitmq_url |
| `backend/app/infrastructure/EventBus.py` | **新建** | RabbitMQ 连接 + publish/consume |
| `backend/app/scheduler/AiReview.py` | **删除** | 被 ReviewWorker 替代 |
| `backend/app/scheduler/ReviewWorker.py` | **新建** | Worker + AI 审核逻辑 |
| `backend/app/scheduler/LifeSpan.py` | 修改 | 管理 Worker 启停 |
| `backend/app/forum/Router.py` | 修改 | create_thread/reply 后 publish |
| `backend/app/task/Router.py` | 修改 | create_task/comment 后 publish |
| `backend/app/admin/Schema/ReviewAction.py` | 修改 | 加 reason |
| `backend/app/admin/Schema/TaskStatusUpdate.py` | 修改 | 加 reason |
| `backend/app/admin/Router.py` | 修改 | 拒绝通知 + 评论审核端点 |
| `backend/app/Seed.py` | 修改 | AI 审核员角色+用户 |
| `frontend/src/pages/admin/posts/index.tsx` | 修改 | 人工拒绝原因弹窗 |
| `frontend/src/api/admin/index.ts` | 修改 | reviewPost 类型 |

---
## RabbitMQ 拓扑

```
exchange: review.exchange (direct, durable)
queue:    review.queue    (durable)
bind:     review.queue ← review.exchange (rk: review.new)
msg:      {"type":"post"|"reply"|"task"|"comment", "id":123}
```

---
## 任务

### Task 1: RabbitMQ 基础设施

**Files:** `docker-compose.yml`, `backend/.env.prod`, `backend/requirements.txt`, `backend/app/Config.py`

#### docker-compose.yml
```yaml
services:
  rabbitmq:
    image: rabbitmq:4-alpine
    container_name: el-snow-hub-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: elsnow
      RABBITMQ_DEFAULT_PASS: MqPass2024!@#
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - el-snow-hub
    restart: unless-stopped

  backend:
    # ... existing ...
    depends_on:
      - rabbitmq

# ...
volumes:
  rabbitmq_data:
```

#### .env.prod
```
RABBITMQ_URL=amqp://elsnow:MqPass2024!@#@rabbitmq:5672/
```

#### requirements.txt
```
aio-pika>=9.5
```

#### Config.py
```python
    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
```

- [ ] 加 rabbitmq 容器 + volume
- [ ] backend depends_on rabbitmq
- [ ] 加 RABBITMQ_URL 环境变量
- [ ] 加 aio-pika 依赖
- [ ] 加 Config 配置项

### Task 2: EventBus 模块

**Files:** Create `backend/app/infrastructure/EventBus.py`

项目规范：单例模式，参考 `Redis.py` / `MinioClient.py`。

```python
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
    """生产者：发布审核任务（路由中同步调用，不等待）"""
    channel = await _get_channel()
    exchange = await channel.get_exchange(EXCHANGE)
    body = json.dumps({"type": type_, "id": item_id}).encode()
    await exchange.publish(
        aio_pika.Message(body=body, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
        routing_key=ROUTING_KEY,
    )


async def consume_review(callback: Callable[[dict], Awaitable[None]]):
    """消费者：注册异步回调"""
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
    """关闭连接"""
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _channel = None
    _connection = None
```

- [ ] 创建 EventBus.py，实现 publish_review / consume_review / close_bus

### Task 3: Seed — AI 审核员角色+用户

**Files:** Modify `backend/app/Seed.py`

ROLES 加 `{"name": "ai-reviewer", "description": "AI 内容审核员", "data_scope": "all"}`

user 权限后加 ai-reviewer 权限赋值：
```python
# ── AI reviewer role ──
ai_reviewer_role = (await db.execute(
    select(Role).where(Role.name == "ai-reviewer")
)).scalar_one()
for code in ["forum:review:list", "forum:review", "forum:boards", "forum:search",
             "forum:threads", "forum:view", "task:list", "task:view", "task:comments",
             "task:approve"]:
    p = (await db.execute(select(Permission).where(Permission.code == code))).scalar_one()
    existing = (await db.execute(
        select(RolePermission).where(
            RolePermission.role_id == ai_reviewer_role.id,
            RolePermission.permission_id == p.id,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(RolePermission(role_id=ai_reviewer_role.id, permission_id=p.id))
        print(f"ai-reviewer ← {code}")
await db.commit()
```

admin user 后加 AI 用户：
```python
# ── AI reviewer user ──
ai_user = (await db.execute(
    select(User).where(User.email == "ai-reviewer@elarion.cn")
)).scalar_one_or_none()
if not ai_user:
    ai_user = User(
        username="AI审核员",
        email="ai-reviewer@elarion.cn",
        password_hash=hash_password("AiReview2024!@#"),
    )
    db.add(ai_user)
    await db.flush()
    db.add(UserRole(user_id=ai_user.id, role_id=ai_reviewer_role.id))
    await db.commit()
    print("AI 审核员已创建")
else:
    if not (await db.execute(
        select(UserRole).where(
            UserRole.user_id == ai_user.id,
            UserRole.role_id == ai_reviewer_role.id,
        )
    )).scalar_one_or_none():
        db.add(UserRole(user_id=ai_user.id, role_id=ai_reviewer_role.id))
        await db.commit()
        print("AI 审核员角色已补全")
```

- [ ] ROLES、权限、用户三步完成

### Task 4: Schema 加 reason

**Files:** `backend/app/admin/Schema/ReviewAction.py`, `backend/app/admin/Schema/TaskStatusUpdate.py`

```python
class ReviewAction(BaseModel):
    status: str | None = None
    reviewed: bool | None = None
    reason: str | None = None
```

```python
class TaskStatusUpdate(BaseModel):
    status: str
    reason: str | None = None
```

- [ ] 两个 schema 各加 reason

### Task 5: Admin Router — 通知 + 评论审核

**Files:** Modify `backend/app/admin/Router.py`

三个接口注入 `user` 参数，拒绝时发通知：

```python
from app.notification.Router import create_notification
```

**review_post：**
```python
if body.status == "rejected" and p.author_id:
    reason = body.reason or "违反社区规范"
    is_thread = p.thread_id is None
    await create_notification(
        db, receiver_id=p.author_id, sender_id=user.id,
        type_="review_rejected",
        content=f"你的{'帖子' if is_thread else '评论'}未通过审核：{reason}",
        link=f"/forum/post/{p.id}" if is_thread else f"/forum/post/{p.thread_id}",
    )
```

**新增 PUT /admin/comments/{comment_id}/review：**
```python
@router.put("/comments/{comment_id}/review",
            dependencies=[Depends(require_perm("forum:review"))])
async def review_comment(
    comment_id: int, body: ReviewAction,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(Comment).where(Comment.id == comment_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "评论不存在")
    if body.status is not None:
        c.status = body.status
    if body.reviewed is not None:
        c.reviewed = body.reviewed
    await db.commit()
    if body.status == "rejected" and c.user_id:
        reason = body.reason or "违反社区规范"
        await create_notification(
            db, receiver_id=c.user_id, sender_id=user.id,
            type_="review_rejected",
            content=f"你的评论未通过审核：{reason}",
            link=f"/market/{c.task_id}",
        )
    return {"ok": True}
```

**update_task_status 同样注入 user + 拒绝通知。**

- [ ] review_post 加拒绝通知
- [ ] 新增 review_comment 端点
- [ ] update_task_status 加拒绝通知

### Task 6: ReviewWorker + AI 审核

**Files:** Create `backend/app/scheduler/ReviewWorker.py`, Delete `backend/app/scheduler/AiReview.py`

```python
"""AI 审核 Worker — 消费 RabbitMQ → Ollama 审核 → 调管理 API 提交"""
import json
import httpx
from sqlalchemy import select
from app.infrastructure.Database import async_session
from app.infrastructure.security.Token import create_access_token
from app.infrastructure.storage.StorageService import storage_service
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.EventBus import consume_review
from app.forum.entity.ForumPost import ForumPost
from app.task.entity.Task import Task as TaskModel
from app.task.entity.Comment import Comment
from app.identity.entity.User import User

AI_EMAIL = "ai-reviewer@elarion.cn"
OLLAMA_URL = "http://ollama:11434/api/chat"
MODEL = "minicpm-v:8b"
API_BASE = "http://localhost:8000/api/v1"

REVIEW_PROMPT = """你是一个内容审核助手。审查以下内容是否违规（色情/暴力/政治敏感/广告/辱骂）。
严格按此 JSON 格式回复：
{"pass": true, "reason": "简短说明"}
pass=true 通过，pass=false 违规。

内容：\n"""

_ai_user_id: int | None = None


async def _get_ai_token() -> str:
    global _ai_user_id
    if _ai_user_id is None:
        async with async_session() as db:
            user = (await db.execute(
                select(User).where(User.email == AI_EMAIL)
            )).scalar_one_or_none()
            if not user:
                raise RuntimeError(f"AI 审核员不存在: {AI_EMAIL}")
            _ai_user_id = user.id
    return create_access_token({"sub": str(_ai_user_id), "email": AI_EMAIL})


async def ai_review_text(text: str, image_urls: list[str] | None = None) -> dict:
    """调 Ollama 审查，返回 {"pass": bool|None, "reason": str}"""
    # ... 同原 AiReview.py 的 ai_review_text，含图片 base64 处理 ...
    # (保留现有实现, timeout=120, keep_alive="10m")


async def _call_review_api(endpoint: str, body: dict, token: str):
    async with httpx.AsyncClient(timeout=30) as cli:
        resp = await cli.put(
            f"{API_BASE}{endpoint}", json=body,
            headers={"Cookie": f"access_token={token}"},
        )
        if resp.status_code != 200:
            print(f"  Review API {endpoint} failed: {resp.status_code} {resp.text}")


async def _handle_message(data: dict):
    type_ = data["type"]
    item_id = data["id"]
    token = await _get_ai_token()

    if type_ in ("post", "reply"):
        async with async_session() as db:
            p = (await db.execute(select(ForumPost).where(ForumPost.id == item_id))).scalar_one_or_none()
            if not p or p.reviewed:
                return
            text = (p.title or "") + "\n" + (p.content or "")
            image_ids = p.image_ids
        images = await _resolve_images(image_ids)
        result = await ai_review_text(text, images)
        if result["pass"] is None:
            return
        status = "approved" if result["pass"] else "rejected"
        print(f"AI {'passed' if result['pass'] else 'rejected'} {type_} #{item_id}: {result['reason']}")
        await _call_review_api(
            f"/admin/posts/{item_id}/review",
            {"status": status, "reviewed": True, "reason": result["reason"]}, token)

    elif type_ == "task":
        # ... 类似，调 /admin/tasks/{id}/status ...

    elif type_ == "comment":
        # ... 类似，调 /admin/comments/{id}/review ...


async def start_worker():
    await consume_review(_handle_message)
    print("AI review worker: started")


async def stop_worker():
    from app.infrastructure.EventBus import close_bus
    await close_bus()
    print("AI review worker: stopped")
```

- [ ] 新建 ReviewWorker.py（含完整 ai_review_text + _resolve_images + _handle_message）
- [ ] 删除 AiReview.py

### Task 7: LifeSpan 管理 Worker

**Files:** Modify `backend/app/scheduler/LifeSpan.py`

```python
from app.scheduler.ReviewWorker import start_worker, stop_worker

# lifespan 中:
await start_worker()
yield
await stop_worker()
```

移除 `run_ai_review` interval job。

- [ ] LifeSpan.py 接入 start/stop worker

### Task 8: 路由触发点发布消息

**Files:** `backend/app/forum/Router.py`, `backend/app/task/Router.py`

```python
from app.infrastructure.EventBus import publish_review
```

4 处各加一行：
- `create_thread` → `await publish_review("post", p.id)`
- `create_reply` → `await publish_review("reply", r.id)`
- `create_task` → `await publish_review("task", task.id)`
- `create_comment` → `await publish_review("comment", c.id)`

- [ ] 4 个接口各加 publish_review

### Task 9: 前端人工拒绝原因

**Files:** `frontend/src/pages/admin/posts/index.tsx`, `frontend/src/api/admin/index.ts`

API 类型：
```ts
reviewPost: (id: number, data: { status?: string; reviewed?: boolean; reason?: string }) =>
  api.put(`/api/v1/admin/posts/${id}/review`, data),
```

页面加拒绝原因 Modal（state + Input.TextArea + 确认按钮）。人工审核不消费 MQ，仍是页面浏览→点击审核→直接调 API 的流程。

- [ ] API 类型加 reason
- [ ] 页面加拒绝原因弹窗

### Task 10: 部署验证

- [ ] scp 全部改动到 NAS
- [ ] `docker compose pull rabbitmq`
- [ ] `docker compose up -d --build`
- [ ] `docker exec el-snow-hub-backend python -m app.Seed`
- [ ] 测试: 发帖 → AI 审核 → 状态更新
- [ ] 测试: 发违规内容 → AI 拒绝 → 通知到达
- [ ] 测试: 管理员人工拒绝 → 原因弹窗 → 通知到达
- [ ] RabbitMQ 面板 `http://192.168.3.21:15672` 查看队列状态
