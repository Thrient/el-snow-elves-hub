# CLAUDE.md — Hub

This file provides guidance to Claude Code when working with the Hub project.

## Build & Test

```bash
# Backend — syntax check (cannot run full tests locally, MinIO not accessible)
cd backend && PYTHONPATH=. python -m pytest tests/test_upload_validation.py -v

# Frontend
cd frontend && npm run build       # tsc + vite build
cd frontend && npm run dev         # dev server
```

## Deploy to NAS

NAS: `192.168.3.21`, SSH user `admin`, path `/vol1/el-snow-elves-hub/`

```bash
# Copy backend files
scp backend/app/path/file.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/path/

# Rebuild backend container
ssh admin@192.168.3.21 "cd /vol1/el-snow-elves-hub && docker compose up -d --build backend"

# Build & deploy frontend
cd frontend && npm run build
scp -r dist admin@192.168.3.21:/vol1/el-snow-elves-hub/frontend/
ssh admin@192.168.3.21 "cd /vol1/el-snow-elves-hub && docker compose restart nginx"

# DB migration (MySQL running in Docker container 'mysql')
ssh admin@192.168.3.21 "docker exec -i mysql mysql -u elsnow -p'T5N3uj+ImElFrfiF' el_snow_hub -e 'SQL_HERE'"

# Check backend logs
ssh admin@192.168.3.21 "docker logs el-snow-hub-backend --tail 20"
```

## Architecture — Backend

**DDD-lite with entity/service/router per domain:**

```
backend/app/
├── api/v1/                    # Public REST endpoints
│   ├── auth.py                # Login/register/token refresh
│   └── Deps.py                # require_perm(), get_current_user, require_perm_any()
├── admin/Router.py            # Admin endpoints (dashboard, users, roles, perms, versions, routes, posts, tasks)
├── task/Router.py             # Task marketplace endpoints
├── forum/Router.py            # Forum endpoints
├── identity/Router.py         # User profile endpoints
├── notification/Router.py     # Notification + SSE endpoints
├── release/Router.py          # Version download endpoints
├── infrastructure/
│   ├── Database.py            # Async SQLAlchemy engine + session factory
│   ├── security/Token.py      # JWT access/refresh + bcrypt
│   ├── storage/
│   │   ├── MinioClient.py     # S3 client (singleton at module level)
│   │   ├── ChunkedUpload.py   # Chunked file upload (init/chunk/complete)
│   │   ├── StorageService.py  # SHA256 dedup + file record creation
│   │   ├── UploadRouter.py    # Upload REST endpoints
│   │   ├── entity/            # Fingerprint, FileRecord, Upload, OrphanTracker
│   │   └── Schema/            # InitRequest, CompleteRequest
│   ├── rbac/entity/           # Role, Permission, RolePermission, UserRole
│   ├── navigation/entity/     # Route (dynamic frontend routing)
│   └── navigation/SeedData.py # PERMISSION_CODES + route seed definitions (shared with seed.py)
├── Seed.py                    # Database seeding: roles, perms, routes, admin user
├── forum/entity/              # ForumBoard, ForumPost, ForumLike
├── task/entity/               # Task, Comment, TaskLike, DownloadRecord, TaskView
├── identity/entity/User.py    # User model with RBAC permission aggregation
├── release/entity/            # DownloadVersion, VersionFile
└── notification/entity/       # Notification
```

**Key patterns:**
- All DB access via async SQLAlchemy 2.0: `select()`, `async_session()`, `await db.execute()`
- Permission checks: `Depends(require_perm("code:action"))` for authenticated, `Depends(require_perm_any("code:action"))` for anonymous-allowed
- API response format: `ok(data)`, `fail(code, msg)` from `infrastructure/Response.py`
- MinIO client is a module-level singleton — cannot import any module that transitively imports MinioClient without a working MinIO connection

**Permission system (RBAC):**
- Users have roles, roles have permissions, permissions are `namespace:action` codes
- `*` wildcard = superadmin
- `require_perm()` — user must have the exact code
- `require_perm_any()` — user OR anonymous role must have the code
- Frontend `RouteGuard` component checks `hasPerm(perm)` on routes
- Route permission codes defined in `SeedData.py`, each code must uniquely identify one route/API

## Architecture — Frontend

```
frontend/src/
├── api/storage/index.ts       # uploadFile() — chunked upload client (5MB chunks, SHA256 precompute)
├── api/admin/index.ts         # Admin API client
├── store/auth.ts              # Zustand auth store with hasPerm()
├── store/routes.ts            # Dynamic route loading from backend
├── router/index.tsx           # Dynamic route tree builder from backend route metadata
├── components/RouteGuard.tsx  # Permission gate for routes
├── layout/AdminLayout.tsx     # Admin shell with sidebar menu
└── pages/                     # Page components (admin/, forum/, etc.)
```

**Frontend API pattern:**
```typescript
import { api } from "@/api/axios";
api.post<ResponseType>("/api/v1/path", body).then(r => r.data);
```

### File Naming Note
- `backend/app/Config.py` is tracked with capital C in git (was `config.py` before case-fix)
- `backend/app/Seed.py` is tracked with lowercase `s` in git
- Windows case-insensitive filesystem — `Config.py` and `config.py` are the same file

---

## UI 设计规范

> **用途：** AI 生成前端代码时严格遵守，确保视觉一致性和代码可维护性。

### 1. 设计令牌

#### 颜色

| Token | 值 | 用途 |
|-------|-----|------|
| 主色 | `#d4513b` | 按钮、链接、强调 |
| 主色深 | `#c43a2a` | hover/press 状态 |
| 背景 | `#faf7f1` | 页面底色 |
| 卡片背景 | `#ffffff` | 卡片、面板 |
| 文字主色 | `#1a1a1a` | 正文 |
| 文字辅色 | `#8c8c8c` | 提示、日期、次要信息 |
| 边框 | `#f0ebe3` | 分割线、卡片边框 |
| 成功 | `#52c41a` | |
| 警告 | `#faad14` | |
| 错误 | `#ff4d4f` | |

#### 字体

```
字体栈: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
根字号: clamp(16px, 1vw, 20px)
```

#### 间距（4px 倍数）

```
步进: 8px | 12px | 16px | 24px | 32px | 48px
页面内边距: 24px (移动端 16px)
卡片内边距: 24px
```

#### 圆角

```
按钮/输入框:  8px
卡片:         12px
弹窗:         16px
```

#### 阴影

```
卡片悬浮:  0 4px 12px rgba(0,0,0,0.08)
弹窗:      0 8px 24px rgba(0,0,0,0.12)
```

### 2. 样式策略

#### 优先级（从高到低）

| 层级 | 方式 | 适用场景 |
|------|------|---------|
| 1 | UnoCSS 原子类 | 间距、排版、布局、颜色、动画 — **优先使用** |
| 2 | Ant Design token | 组件级主题（`colorPrimary`、`borderRadius`） |
| 3 | Ant Design props | 组件微调（Card `bodyStyle`） |
| 4 | `<style>` 标签 | **仅限** `@keyframes` 动画，禁止用于常规样式 |

#### 禁止项

- ❌ 组件内 `style={{}}` 内联样式 — 用 UnoCSS 类
- ❌ `.module.css` 文件 — 用 UnoCSS
- ❌ 非 `#` 格式的颜色值（hsl/rgb/named）
- ❌ 魔法数字（`width: 387px`、`height: 53px`）
- ❌ 裸 `<div>` + 内联样式做自定义组件 — 抽成组件

#### UnoCSS 快捷方式

```typescript
// uno.config.ts shortcuts
shortcuts: {
  "card-hover": "transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
}
```

#### 颜色使用

```tsx
// ✅ 正确
className="text-[#d4513b] bg-[#faf7f1]"

// ❌ 错误
style={{ color: '#d4513b', backgroundColor: '#faf7f1' }}
```

### 3. 组件规范

#### 页面标准骨架

```tsx
import { useState, useEffect, type FC } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Spin, Empty } from "antd";
import { forumApi } from "@/api/forum";
import type { Thread } from "@/types/forum";

interface Props {
  boardId: number;
  onSuccess?: () => void;
}

const ThreadList: FC<Props> = ({ boardId, onSuccess }) => {
  // ── 状态 ──
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Thread[]>([]);

  // ── 数据获取 ──
  useEffect(() => {
    forumApi.list(boardId)
      .then(setItems)
      .catch(() => { /* ErrorToast 已处理 */ })
      .finally(() => setLoading(false));
  }, [boardId]);

  // ── 渲染顺序: loading → empty → normal ──
  if (loading) return <Spin spinning><div className="min-h-40" /></Spin>;
  if (!items.length) return <Empty description="暂无帖子" />;

  return (
    <div className="w-full px-6 py-6">
      {items.map(item => (
        <Card key={item.id} className="card-hover cursor-pointer mb-4">
          {item.title}
        </Card>
      ))}
    </div>
  );
};

export const page = "ThreadList";
export default ThreadList;
```

#### 页面宽度规则

```
所有页面:     w-full px-6              — 撑满宽度，两侧保留 24px 内边距
最大宽度:     max-w-[1600px] mx-auto   — 超大屏(>1600px)居中，不继续拉伸
```

**禁止依赖内容撑开宽度。禁止 max-w-5xl/max-w-7xl 造成两侧大边距。**

#### 表单规范

```tsx
<Form layout="vertical" requiredMark="optional" size="large">
  <Form.Item label="标题" name="title" rules={[{ required: true }]}>
    <Input placeholder="请输入标题" maxLength={128} />
  </Form.Item>
  <Form.Item>
    <Button type="primary" htmlType="submit" loading={submitting}>提交</Button>
  </Form.Item>
</Form>
```

- layout 统一 `"vertical"`，size 统一 `"large"`
- placeholder: `"请输入xxx"` / `"请选择xxx"`
- 提交按钮必须处理 `loading` 状态
- 一个区域内最多一个 `type="primary"` 按钮

#### 卡片规范

```tsx
// 可点击卡片
<Card className="card-hover cursor-pointer" onClick={handleClick}>

// 列表间隔
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
```

#### 按钮规范

```tsx
<Button type="primary">提交</Button>           // 主操作
<Button>取消</Button>                            // 次操作
<Button type="primary" danger>删除</Button>      // 危险操作
```

- 按钮文案用动词，不用名词
- 异步按钮必须处理 `loading`

### 4. 状态展示

```tsx
// 必须按此顺序覆盖三种状态:

// 1. 加载中
<Spin spinning={loading}>
  <div className="min-h-40">{/* 内容 */}</div>
</Spin>

// 详情用 Skeleton
<Skeleton active paragraph={{ rows: 4 }} />

// 2. 空数据
<Empty description="暂无数据" />
<Empty description="还没有帖子，快来发布第一个吧">
  <Button type="primary">发布帖子</Button>
</Empty>

// 3. 错误 — 全局 ErrorToast 处理，组件只做状态清理
try {
  await fetchData();
} catch {
  setLoading(false);  // 清理 loading，不弹 toast
}
```

- Spin 容器必须设 `min-h`，避免加载图标偏上
- Empty 的 `description` 必须有实际语义
- catch 块不能完全为空，至少清理 loading 状态

### 5. 响应式设计

```yaml
断点:
  sm:   640px
  md:   768px
  lg:   1024px
  xl:   1280px
  2xl:  1536px

规则:
  - 移动优先: 先写移动端，再用 sm:/md:/lg: 向上覆盖
  - 卡片网格: grid-cols-1 → md:grid-cols-2 → lg:grid-cols-3 → xl:grid-cols-4
  - 表单:     单列(移动) → 双列(lg: w-1/2)
  - 页面边距: px-4(移动) → px-6(桌面)
```

### 6. 动效与图标

```yaml
动效:
  - 过渡统一 300ms:     duration-300
  - 卡片悬浮:            card-hover (已定义)
  - 禁止 JS 驱动动画     — 用 CSS transition/animation
  - 新 keyframes 加在    uno.config.ts

图标:
  - 唯一来源:            @ant-design/icons 6
  - 行内: 1em | 按钮: 16px | 标题: 24px | 装饰: 48px
  - 图标后跟文字加 mr-2
  - 纯图标按钮:          type="text" shape="circle"
```

---

## 代码质量规范

> **用途：** 前后端代码的统一编码标准，AI 生成代码时严格遵守。

### 1. 文件命名与目录结构

#### 前端

```
component/page:  PascalCase.tsx         ✅ AdminLayout.tsx   ❌ admin-layout.tsx
Hook:            useXxx.ts              ✅ useAuth.ts
Store:           xxx.ts                 (导出 useXxxStore)
API module:      api/<domain>/index.ts  ✅ api/forum/index.ts
Types:           types/<domain>/index.ts
Util:            util/xxx.ts
```

#### 后端

```
Router/Entity/Schema:  PascalCase.py    ✅ Router.py  User.py
Directory:             snake_case       ✅ infrastructure/storage/
DB model class:        PascalCase       ✅ class ForumPost(Base)
Pydantic Schema:       PascalCase       ✅ class ThreadCreate(BaseModel)
Function/Variable:     snake_case       ✅ def get_current_user()
Constant:              UPPER_SNAKE      ✅ CHUNK_SIZE
```

### 2. 类型规则

#### TypeScript

```yaml
必须:
  - tsconfig strict: true (已有)
  - Props 用 interface     ✅ interface Props { id: number }
  - API 返回类型显式声明   ✅ api.get<Board[]>("/boards")
  - 回调函数显式参数类型   ✅ (e: ProgressEvent) => { ... }
  - Store 显式类型          ✅ create<AuthState>()(...)
  - null/undefined:        可选用 ?, 未初始化用 null, 禁止混用

禁止:
  - any                    → 用 unknown + 类型守卫
  - @ts-ignore / @ts-expect-error
  - 隐式 any 参数
```

#### Python

```yaml
必须:
  - 所有函数参数 + 返回值有类型注解
  - Pydantic/SQLAlchemy 字段有类型
  - SQLAlchemy 用 Mapped[] (2.0 风格)

禁止:
  - 裸 except:         → 用 except Exception:
  - 空 except 块       → 至少 log.warning
```

### 3. 导入顺序

#### 前端

```typescript
// 1. React
import { useState, useEffect, type FC } from "react";

// 2. React Router
import { useNavigate, useParams } from "react-router";

// 3. Ant Design
import { Button, Card, Spin, Empty } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

// 4. 第三方
import { create } from "zustand";

// 5. 项目模块 (API → Store → Types → Util)
import { forumApi } from "@/api/forum";
import { useAuthStore } from "@/store/auth";
import type { Board } from "@/types/forum";
import { formatTime } from "@/util/time";

// 组间空一行，组内不空行
// 类型导入用 type 关键字
```

#### 后端

```python
# 1. 标准库
import asyncio
from typing import Optional

# 2. 第三方
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

# 3. 项目模块
from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user
```

### 4. 组件/函数结构

- 前端页面：状态 → 数据获取 → 条件渲染(loading→empty→normal)
- 后端路由：参数 → 权限依赖 → 业务逻辑 → `ok()`/`fail()`
- 每个文件一个核心导出，辅助函数在同文件底部

### 5. API 与错误处理

#### 前端三层

```yaml
第1层 (axios interceptor):
  401 → refresh token → 失败 → auth:expired
  非401 → bus.emit("app:error") → 全局 ErrorToast

第2层 (API 模块):
  .then(r => r.data)  # 统一展开
  不 catch

第3层 (组件):
  catch 只做状态清理，不弹 toast
```

```typescript
// ✅ 正确: API 模块统一展开
export const forumApi = {
  boards: (): Promise<Board[]> =>
    api.get<{ code: number; data: Board[] }>("/api/v1/forum/boards")
      .then(r => r.data),
};
```

#### 后端

```python
# ✅ 统一用 ok() 返回
return ok(boards)

# ✅ HTTPException + 语义化消息
raise HTTPException(404, "帖子不存在")

# ❌ 禁止裸 raise
raise Exception("出错了")
```

### 6. Linting 配置

#### 前端（需新增）

```json
// package.json devDependencies
"@antfu/eslint-config": "^4",
"lint-staged": "^15"

// package.json scripts
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

```javascript
// eslint.config.js
import antfu from "@antfu/eslint-config";

export default antfu({
  react: true,
  typescript: { tsconfigPath: "tsconfig.json" },
  rules: {
    "antfu/top-level-function": "off",
    "react-hooks/exhaustive-deps": "warn",
    "no-console": "warn",
  },
});
```

#### 后端（需新增）

```toml
# pyproject.toml
[tool.ruff]
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.ruff.format]
quote-style = "double"
```

#### 构建检查流程

```
1. tsc --noEmit     # 类型检查
2. eslint .         # Lint
3. vite build       # 构建
```
