# 全局审计日志 + 审核中心改造 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Hub 全站 56 个操作端点添加审计日志，审核中心显示全部状态，管理后台新增加日志查询页面。

**Architecture:** 新建 `audit_logs` 表，`audit/service.py` 提供 `log_audit()` 统一写入函数。在所有需要记录的端点中调用此函数。审核中心 API 加 `?status=` 参数。管理后台新增 `/admin/audit-logs` 查询端点 + 前端页面。

**Tech Stack:** FastAPI + SQLAlchemy + MySQL + React + Ant Design + UnoCSS

---

## File Map

| 操作 | 文件 |
|------|------|
| **新建** | `backend/app/audit/__init__.py` |
| **新建** | `backend/app/audit/entity/__init__.py` |
| **新建** | `backend/app/audit/entity/AuditLog.py` |
| **新建** | `backend/app/audit/Schema/__init__.py` |
| **新建** | `backend/app/audit/Schema/AuditLogOut.py` |
| **新建** | `backend/app/audit/service.py` |
| **新建** | `frontend/src/pages/admin/logs/index.tsx` |
| **新建** | `frontend/src/api/admin/audit.ts` |
| **改** | `backend/app/admin/Router.py` — 加审计日志查询端点 |
| **改** | `backend/app/review/Router.py` — 加 status 参数 |
| **改** | `backend/app/task/Router.py` — 埋点 |
| **改** | `backend/app/forum/Router.py` — 埋点 |
| **改** | `backend/app/identity/Router.py` — 埋点 |
| **改** | `backend/app/infrastructure/storage/UploadRouter.py` — 埋点 |
| **改** | `backend/app/release/Router.py` — 埋点 |
| **改** | `frontend/src/pages/review/index.tsx` — Tabs |
| **改** | `frontend/src/api/review/index.ts` — 加 status 参数 |
| **改** | `frontend/src/router/index.tsx` — 加 /admin/logs 路由 |

---

### Task 1: 数据库建表

**Files:** SQL only

- [ ] **Step 1: 在 NAS MySQL 执行建表**

```bash
ssh admin@192.168.3.21 "docker exec -i mysql mysql -u elsnow -p'T5N3uj+ImElFrfiF' el_snow_hub -e \"
CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(64) DEFAULT '',
  action VARCHAR(32) NOT NULL,
  resource_type VARCHAR(32) DEFAULT '',
  resource_id INT NULL,
  detail VARCHAR(2000) DEFAULT '',
  ip VARCHAR(45) DEFAULT '',
  created_at DATETIME(3) DEFAULT NOW(3),
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_time (created_at)
);
\""
```

- [ ] **Step 2: 验证**

```bash
ssh admin@192.168.3.21 "docker exec -i mysql mysql -u elsnow -p'T5N3uj+ImElFrfiF' el_snow_hub -e 'DESC audit_logs'"
```

---

### Task 2: AuditLog 实体 + Schema

**Files:**
- Create: `backend/app/audit/__init__.py`
- Create: `backend/app/audit/entity/__init__.py`
- Create: `backend/app/audit/entity/AuditLog.py`
- Create: `backend/app/audit/Schema/__init__.py`
- Create: `backend/app/audit/Schema/AuditLogOut.py`

- [ ] **Step 1: 创建目录和模型文件**

`backend/app/audit/__init__.py`:
```python
```

`backend/app/audit/entity/__init__.py`:
```python
```

`backend/app/audit/entity/AuditLog.py`:
```python
"""审计日志实体"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.Database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    username: Mapped[str] = mapped_column(String(64), default="")
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), default="")
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(String(2000), default="")
    ip: Mapped[str] = mapped_column(String(45), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

- [ ] **Step 2: 创建 Schema**

`backend/app/audit/Schema/__init__.py`:
```python
```

`backend/app/audit/Schema/AuditLogOut.py`:
```python
from datetime import datetime
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    username: str
    action: str
    resource_type: str
    resource_id: int | None
    detail: str
    ip: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/audit/
git commit -m "feat: add AuditLog entity and schema"
```

---

### Task 3: audit/service.py — log_audit()

**Files:**
- Create: `backend/app/audit/service.py`

- [ ] **Step 1: 创建服务文件**

```python
"""审计日志写入服务"""
from app.audit.entity.AuditLog import AuditLog
from app.infrastructure.Database import async_session
from app.identity.entity.User import User


async def log_audit(
    user: User | None,
    action: str,
    resource_type: str = "",
    resource_id: int | None = None,
    detail: str = "",
    ip: str = "",
):
    """写入一条审计日志。user 传 None 表示匿名操作。"""
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail[:2000],
        ip=ip[:45],
    )
    async with async_session() as db:
        db.add(log)
        await db.commit()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/audit/service.py
git commit -m "feat: add log_audit() service"
```

---

### Task 4: audit/Router.py — 查询 API

**Files:**
- Create: `backend/app/audit/Router.py`
- Modify: `backend/app/admin/Router.py`

- [ ] **Step 1 & 2: 在 admin/Router.py 中直接添加审计查询端点**

`backend/app/admin/Router.py` 已有 `router = APIRouter(prefix="/admin")`. 在文件末尾添加：

在 `backend/app/admin/Router.py` 文件末尾（`router = APIRouter(prefix="/admin")` 已定义）添加：

```python
from app.audit.entity.AuditLog import AuditLog
from app.audit.Schema.AuditLogOut import AuditLogOut
from datetime import datetime

@router.get("/audit-logs", dependencies=[Depends(require_perm("admin:audit"))])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog)
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action:
        q = q.where(AuditLog.action == action)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if start:
        q = q.where(AuditLog.created_at >= datetime.fromisoformat(start))
    if end:
        q = q.where(AuditLog.created_at <= datetime.fromisoformat(end))

    count_q = select(func.count(AuditLog.id)).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (await db.execute(
        q.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size)
    )).scalars().all()

    return ok({
        "items": [AuditLogOut.model_validate(r) for r in rows],
        "total": total,
    })
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/admin/Router.py backend/app/audit/
git commit -m "feat: add audit log query API"
```

---

### Task 5: 埋点 — 认证操作 (identity/Router.py)

**Files:**
- Modify: `backend/app/identity/Router.py`

在文件顶部 import：
```python
from app.audit.service import log_audit
```

- [ ] **register**: 在 return ok(...) 前加：
```python
await log_audit(new_user, "register", "user", new_user.id,
                f"用户名: {new_user.username}", request.client.host if request.client else "")
```

- [ ] **login**: 在登录成功后加（login 函数已有 `request: Request` 参数）：
```python
await log_audit(user, "login", "user", user.id, "", request.client.host if request.client else "")
```
在登录失败分支（password 错误 / user not found）加，用匿名用户：
```python
await log_audit(None, "login_fail", "user", None,
               f"邮箱: {email}", request.client.host if request.client else "")
```

- [ ] **logout**: 在 return ok() 前加：
```python
await log_audit(current_user, "logout", "user", current_user.id, "", request.client.host if request.client else "")
```

- [ ] **update_me** (PUT /auth/me): 如果改了 username：
```python
await log_audit(current_user, "update", "user", current_user.id,
                f"修改用户名: {body.username}", request.client.host if request.client else "")
```

- [ ] **set_avatar**: 添加：
```python
await log_audit(current_user, "upload", "file", None,
                "头像上传", request.client.host if request.client else "")
```

- [ ] **Commit**

```bash
git add backend/app/identity/Router.py
git commit -m "feat: audit logging for auth endpoints"
```

---

### Task 6: 埋点 — 任务操作 (task/Router.py)

**Files:**
- Modify: `backend/app/task/Router.py`

Import:
```python
from app.audit.service import log_audit
```

- [ ] **create_task**: return ok() 前：
```python
await log_audit(user, "create", "task", task.id,
                f"任务「{title}」v{version}", request.client.host if request.client else "")
```

- [ ] **update_task**: return ok() 前：
```python
await log_audit(user, "update", "task", task_id,
                f"任务 #{task_id}", request.client.host if request.client else "")
```

- [ ] **delete_task**: 删除前：
```python
await log_audit(user, "delete", "task", task_id,
                f"任务「{t.title}」", request.client.host if request.client else "")
```

- [ ] **download_task**: return 前：
```python
await log_audit(user, "download", "task", task_id,
                f"v{version or 'latest'}", request.client.host if request.client else "")
```

- [ ] **create_task_version**: return ok() 前：
```python
await log_audit(user, "create", "task_version", tv.id,
                f"任务 #{task_id} v{version}", request.client.host if request.client else "")
```

- [ ] **replace_version_file**: return ok() 前：
```python
await log_audit(user, "update", "task_version", version_id,
                f"替换文件", request.client.host if request.client else "")
```

- [ ] **delete_task_version**: return ok() 前：
```python
await log_audit(user, "delete", "task_version", version_id,
                f"任务 #{task_id} v{tv.version}", request.client.host if request.client else "")
```

- [ ] **create_comment**: return ok() 前：
```python
await log_audit(user, "create", "comment", c.id,
                f"任务 #{task_id}", request.client.host if request.client else "")
```

- [ ] **delete_comment**: return ok() 前：
```python
await log_audit(user, "delete", "comment", comment_id,
                "", request.client.host if request.client else "")
```

- [ ] **Commit**

```bash
git add backend/app/task/Router.py
git commit -m "feat: audit logging for task endpoints"
```

---

### Task 7: 埋点 — 论坛 + 审核 + 上传 + 下载

**Files:**
- Modify: `backend/app/forum/Router.py`
- Modify: `backend/app/review/Router.py`
- Modify: `backend/app/infrastructure/storage/UploadRouter.py`
- Modify: `backend/app/release/Router.py`

Import in each:
```python
from app.audit.service import log_audit
```

- [ ] **forum — create_thread**: return ok() 前：
```python
await log_audit(user, "create", "post", p.id,
                f"帖子「{body.title}」", request.client.host if request.client else "")
```

- [ ] **forum — create_reply**: return ok() 前：
```python
await log_audit(user, "create", "reply", r.id, "",
                request.client.host if request.client else "")
```

- [ ] **forum — update_thread**: return ok() 前：
```python
await log_audit(user, "update", "post", thread_id, "",
                request.client.host if request.client else "")
```

- [ ] **forum — delete_thread**: 删除前：
```python
await log_audit(user, "delete", "post", thread_id,
                f"帖子「{p.title}」", request.client.host if request.client else "")
```

- [ ] **forum — admin_action**: return ok() 前：
```python
await log_audit(user, "update", "post", thread_id,
                f"管理员操作: {body.action}", request.client.host if request.client else "")
```

- [ ] **review — decide_review**: return ok() 前：
```python
await log_audit(user, "approve" if body.status == "approved" else "reject",
                "review", record_id,
                f"审核 #{record_id} {rec.content_type}: {body.reason or ''}",
                request.client.host if request.client else "")
```

- [ ] **UploadRouter — complete_upload**: return ok() 前：
```python
await log_audit(None, "upload", "file", fingerprint.id,
                f"分片上传完成 sha256={sha256[:16]}", request.client.host if request.client else "")
```

- [ ] **UploadRouter — direct_upload**: return ok() 前：
```python
await log_audit(None, "upload", "file", fingerprint.id,
                f"直接上传 {filename} {size}bytes", request.client.host if request.client else "")
```

- [ ] **release — download_version_zip**: return exe_bytes 前：
```python
await log_audit(None, "download", "version", version_id,
                f"客户端下载 v{version.version}", request.client.host if request.client else "")
```

- [ ] **release — download_blob_by_record**: return 前：
```python
await log_audit(None, "download", "file", record_id, "",
                request.client.host if request.client else "")
```

- [ ] **Commit**

```bash
git add backend/app/forum/Router.py backend/app/review/Router.py backend/app/infrastructure/storage/UploadRouter.py backend/app/release/Router.py
git commit -m "feat: audit logging for forum, review, upload, download"
```

---

### Task 8: 埋点 — 管理员操作 (admin/Router.py)

**Files:**
- Modify: `backend/app/admin/Router.py`

Import:
```python
from app.audit.service import log_audit
```

- [ ] **update_user_roles** (PUT /admin/users/{id}/roles): 在 return 前加：
```python
await log_audit(current_user, "update", "user", user_id,
                f"角色分配: {body.role_ids}", request.client.host if request.client else "")
```

- [ ] **toggle_disable_user** (PUT /admin/users/{id}/disable): 
```python
await log_audit(current_user, "disable" if user.is_disabled else "enable", "user", user_id,
                f"用户 {'禁用' if user.is_disabled else '启用'}", request.client.host if request.client else "")
```

- [ ] **delete_user** (DELETE /admin/users/{id}): 删除前：
```python
await log_audit(current_user, "delete", "user", user_id,
                f"删除用户 #{user_id}", request.client.host if request.client else "")
```

- [ ] **create_role**: 不加（已有，共用一个 `log_audit` 模式）
```python
await log_audit(current_user, "create", "role", role.id, f"角色「{body.name}」", request.client.host if request.client else "")
```

- [ ] **update_role**: 无此函数。但 update_role_permissions 需要：
```python
await log_audit(current_user, "update", "role", role_id,
                f"权限更新: {body.permission_ids}", request.client.host if request.client else "")
```

- [ ] **delete_role**:
```python
await log_audit(current_user, "delete", "role", role_id, "", request.client.host if request.client else "")
```

- [ ] **create_permission**:
```python
await log_audit(current_user, "create", "permission", perm.id, f"权限「{body.code}」", request.client.host if request.client else "")
```

- [ ] **update_permission**:
```python
await log_audit(current_user, "update", "permission", perm_id, "", request.client.host if request.client else "")
```

- [ ] **delete_permission**:
```python
await log_audit(current_user, "delete", "permission", perm_id, "", request.client.host if request.client else "")
```

- [ ] **create_version** (POST /admin/versions):
```python
await log_audit(current_user, "create", "version", ver.id, f"客户端 v{body.version}", request.client.host if request.client else "")
```

- [ ] **delete_version**:
```python
await log_audit(current_user, "delete", "version", version_id, "", request.client.host if request.client else "")
```

- [ ] **create_route**:
```python
await log_audit(current_user, "create", "route", route.id, f"路由「{body.path}」", request.client.host if request.client else "")
```

- [ ] **update_route**:
```python
await log_audit(current_user, "update", "route", route_id, "", request.client.host if request.client else "")
```

- [ ] **delete_route**:
```python
await log_audit(current_user, "delete", "route", route_id, "", request.client.host if request.client else "")
```

- [ ] **toggle_route**:
```python
await log_audit(current_user, "update", "route", route_id, f"切换状态", request.client.host if request.client else "")
```

- [ ] **Commit**

```bash
git add backend/app/admin/Router.py
git commit -m "feat: audit logging for admin endpoints"
```

---

### Task 9: 审核中心 API 改造 + 前端 Tabs

**Files:**
- Modify: `backend/app/review/Router.py`
- Modify: `frontend/src/api/review/index.ts`
- Modify: `frontend/src/pages/review/index.tsx`

- [ ] **Step 1: 后端 — list_pending 改为 list_reviews**

在 `backend/app/review/Router.py` 中：

```python
@router.get("/pending", dependencies=[Depends(require_perm("review:list"))])
async def list_pending(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query("pending", pattern="^(pending|approved|rejected)$"),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count(ReviewRecord.id)).where(ReviewRecord.status == status)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(ReviewRecord)
        .where(ReviewRecord.status == status)
        .order_by(ReviewRecord.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    # ... rest unchanged
```

- [ ] **Step 2: 前端 API — reviewApi.pending → reviewApi.list**

`frontend/src/api/review/index.ts`:
```typescript
export const reviewApi = {
  list: (params: { page?: number; size?: number; status?: string } = {}) =>
    api.get<...>(`/api/v1/reviews/pending`, { params }).then(r => r.data),
  decide: (...) => ...  // unchanged
};
```

- [ ] **Step 3: 前端 — 审核中心页面 Tabs**

`frontend/src/pages/review/index.tsx`：

在现有组件顶部加 Tabs：

```tsx
import { Tabs } from "antd";

const [status, setStatus] = useState("pending");

// Replace list fetch:
reviewApi.list({ page: p, size: pageSize, status }).then(res => {
  setItems(res.items);
  setTotal(res.total);
});

// ... in render:
<Tabs activeKey={status} onChange={(k) => { setStatus(k); load(1); }}
  items={[
    { key: "pending", label: `待审核` },
    { key: "approved", label: "已通过" },
    { key: "rejected", label: "已拒绝" },
  ]}
/>
```

已通过/已拒绝的 Item 不显示"通过""拒绝"按钮，只显示 AI 分析和结果。

- [ ] **Step 4: Commit**

```bash
git add backend/app/review/Router.py frontend/src/api/review/index.ts frontend/src/pages/review/index.tsx
git commit -m "feat: review center shows all status tabs"
```

---

### Task 10: 管理后台审计日志页面

**Files:**
- Create: `frontend/src/pages/admin/logs/index.tsx`
- Create: `frontend/src/api/admin/audit.ts`
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: 前端 API**

`frontend/src/api/admin/audit.ts`:
```typescript
import { api } from "@/api/axios";

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  resource_type: string;
  resource_id: number | null;
  detail: string;
  ip: string;
  created_at: string;
}

export const auditApi = {
  list: (params: Record<string, unknown>) =>
    api.get<{ code: number; data: { items: AuditLogItem[]; total: number } }>(
      "/api/v1/admin/audit-logs", { params }
    ).then(r => r.data),
};
```

- [ ] **Step 2: 日志页面组件**

`frontend/src/pages/admin/logs/index.tsx`:

```tsx
import { useState, useEffect, type FC } from "react";
import { Table, DatePicker, Select, Input, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { auditApi, type AuditLogItem } from "@/api/admin/audit";

const ACTION_COLORS: Record<string, string> = {
  create: "#52c41a", update: "#1677ff", delete: "#ff4d4f",
  login: "#1677ff", logout: "#8c8c8c", login_fail: "#faad14",
  register: "#52c41a", upload: "#1677ff", download: "#13c2c2",
  approve: "#52c41a", reject: "#ff4d4f", disable: "#faad14", enable: "#52c41a",
};

const LogsPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const load = (p = 1) => {
    setLoading(true);
    const params: Record<string, unknown> = { page: p, size: 20 };
    if (action) params.action = action;
    if (dateRange) { params.start = dateRange[0]; params.end = dateRange[1]; }
    auditApi.list(params).then(d => { setData(d.items); setTotal(d.total); })
      .catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, [action, dateRange]);

  const columns = [
    { title: "时间", dataIndex: "created_at", width: 160,
      render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "用户", dataIndex: "username", width: 100 },
    { title: "操作", dataIndex: "action", width: 90,
      render: (v: string) => <Tag color={ACTION_COLORS[v] || "#8c8c8c"}>{v}</Tag> },
    { title: "资源", key: "resource", width: 100,
      render: (_: unknown, r: AuditLogItem) => r.resource_type ? `${r.resource_type} #${r.resource_id}` : "-" },
    { title: "详情", dataIndex: "detail", ellipsis: true },
    { title: "IP", dataIndex: "ip", width: 130 },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header__left">
          <span className="page-header__accent" />
          <h2 className="page-header__title">审计日志</h2>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Select placeholder="操作类型" value={action} onChange={setAction}
          allowClear className="w-36"
          options={["login","logout","register","create","update","delete","upload","download","approve","reject","disable","enable"].map(a => ({ label: a, value: a }))} />
        <DatePicker.RangePicker showTime onChange={(_, s) => setDateRange(s as [string, string])}
          className="!rounded-xl" />
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); load(p); },
          showTotal: (t: number) => `共 ${t} 条` }} />
    </div>
  );
};

export const page = "LogsPage";
export default LogsPage;
```

- [ ] **Step 3: 加路由和侧栏菜单**

在 `frontend/src/router/index.tsx` 的 Admin 路由组中加：
```tsx
{ path: "/admin/logs", element: <Suspense fallback={<Spin />}><LogsPage /></Suspense> }
```

在 AdminLayout 侧栏菜单 `menuItems` 数组中加：
```tsx
{
  key: "/admin/logs",
  icon: <FileSearchOutlined />,
  label: "审计日志",
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/logs/index.tsx frontend/src/api/admin/audit.ts frontend/src/router/index.tsx
git commit -m "feat: admin audit logs page"
```

---

### Task 11: 权限注册 + 部署

**Files:**
- Modify: `backend/app/infrastructure/navigation/SeedData.py`

- [ ] **Step 1: 注册 audit 权限码**

```python
("admin:audit", "查看审计日志"),
```

- [ ] **Step 2: 部署后端**

```bash
# 复制所有改动过的后端文件
scp backend/app/audit/entity/AuditLog.py backend/app/audit/service.py backend/app/audit/Schema/AuditLogOut.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/audit/
scp backend/app/admin/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/admin/
scp backend/app/task/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/task/
scp backend/app/forum/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/forum/
scp backend/app/identity/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/identity/
scp backend/app/review/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/review/
scp backend/app/infrastructure/storage/UploadRouter.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
scp backend/app/release/Router.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/release/
scp backend/app/infrastructure/navigation/SeedData.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/navigation/

# 重建后端容器
ssh admin@192.168.3.21 "cd /vol1/el-snow-elves-hub && docker compose up -d --build backend"
```

- [ ] **Step 3: 部署前端**

```bash
cd frontend && npm run build
scp -r dist admin@192.168.3.21:/vol1/el-snow-elves-hub/frontend/
ssh admin@192.168.3.21 "cd /vol1/el-snow-elves-hub && docker compose restart nginx"
```

- [ ] **Step 3: 验证**

访问 `https://elves.elarion.cn/admin/logs`，确认日志列表可见。

---

## 验证

```bash
cd frontend && npm run build          # 前端零错误
cd backend && PYTHONPATH=. python -m pytest tests/ -v  # 后端测试
```
