# 内容审核系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员审核论坛帖子/评论/任务内容，标记已审避免重复处理

**Architecture:** 3 个实体(Task/ForumPost/Comment)各加 `reviewed` 字段 + `status` 字段(仅 ForumPost/Comment)；公开端点只展示 `status=approved`；管理端新增帖子审核/评论审核页，任务管理加过滤器

**Tech Stack:** FastAPI + SQLAlchemy + React + Ant Design

---

### Task 1: DB 迁移 + Entity + 权限

**Files:**
- Modify: `backend/app/forum/entity/ForumPost.py:17-35`
- Modify: `backend/app/task/entity/Comment.py:13-20`
- Modify: `backend/app/task/entity/Task.py:27-35`
- Modify: `backend/app/Seed.py:56-60` + 匿名/用户权限
- Modify: `backend/app/admin/Router.py:296-310`

- [ ] **Step 1: ForumPost 加 status + reviewed**

```python
# ForumPost.py — 第 30 行后添加
status: Mapped[str] = mapped_column(String(16), default="approved", comment="approved/rejected")
reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 2: Comment 加 status + reviewed**

```python
# Comment.py — 第 20 行后添加
status: Mapped[str] = mapped_column(String(16), default="approved", comment="approved/rejected")
reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 3: Task 加 reviewed**

```python
# Task.py — 第 32 行后添加
reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
```

- [ ] **Step 4: Seed.py 加审核权限**

在 `PERMISSION_CODES` 添加:
```python
"forum:review": "审核帖子/评论",
"task:review": "审核任务",
```

在 admin role 权限列表添加 `"forum:review"` `"task:review"`。

- [ ] **Step 5: 生产 DB 执行迁移**

```sql
ALTER TABLE forum_posts ADD COLUMN status VARCHAR(16) DEFAULT 'approved';
ALTER TABLE forum_posts ADD COLUMN reviewed TINYINT(1) DEFAULT 0;
ALTER TABLE comments ADD COLUMN status VARCHAR(16) DEFAULT 'approved';
ALTER TABLE comments ADD COLUMN reviewed TINYINT(1) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN reviewed TINYINT(1) DEFAULT 0;
```

- [ ] **Step 6: Seed.py 加自动迁移**

```python
# seed() 末尾，兼容性迁移
for sql in [
    "ALTER TABLE forum_posts ADD COLUMN status VARCHAR(16) DEFAULT 'approved'",
    "ALTER TABLE forum_posts ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
    "ALTER TABLE comments ADD COLUMN status VARCHAR(16) DEFAULT 'approved'",
    "ALTER TABLE comments ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN reviewed TINYINT(1) DEFAULT 0",
]:
    try: await db.execute(text(sql)); await db.commit()
    except: await db.rollback()
```

- [ ] **Step 7: 部署后端 + 跑 Seed**

```bash
scp admin@192.168.3.21:... backend files
docker compose build backend --no-cache && docker compose up -d --force-recreate backend
docker exec el-snow-hub-backend python -m app.Seed
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/forum/entity/ForumPost.py backend/app/task/entity/Comment.py backend/app/task/entity/Task.py backend/app/Seed.py
git commit -m "feat: add status/reviewed columns to ForumPost, Comment, Task"
```

---

### Task 2: 后端 — 公开端点状态过滤

**Files:**
- Modify: `backend/app/forum/Router.py:76-98` (list threads)
- Modify: `backend/app/forum/Router.py:115-170` (thread detail + replies)

- [ ] **Step 1: 论坛列表只查 approved**

`list_threads` 已在 `boards/{id}/threads` 中查全部帖子。改为只查未拒绝的：

```python
# list_threads — 添加 where 条件
q = select(ForumPost).where(
    ForumPost.thread_id.is_(None),
    ForumPost.board_id == board_id,
    ForumPost.status != "rejected",
)
```

- [ ] **Step 2: thread_detail 过滤 rejected 回复**

回复列表只显示 `status != "rejected"`：

```python
all = (await db.execute(
    select(ForumPost).where(
        ForumPost.thread_id == thread_id,
        ForumPost.status != "rejected",
    ).order_by(ForumPost.created_at)
)).scalars().all()
```

如果主帖本身是 rejected，返回 404：

```python
if p.status == "rejected":
    raise HTTPException(404, "帖子不存在")
```

- [ ] **Step 3: 论坛搜索排除 rejected**

```python
q = select(ForumPost).where(
    ForumPost.thread_id.is_(None),
    ForumPost.status != "rejected",
    ...
)
```

- [ ] **Step 4: 部署后端**

```bash
scp admin@192.168.3.21:... backend/app/forum/Router.py
docker compose build backend --no-cache && docker compose up -d --force-recreate backend
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/forum/Router.py
git commit -m "feat: filter rejected posts from public forum endpoints"
```

---

### Task 3: 后端 — 管理端审核端点

**Files:**
- Modify: `backend/app/admin/Router.py:296-310` (扩展现有 tasks 区域)
- `backend/app/admin/Schema/ReviewAction.py` (新建)

- [ ] **Step 1: 新建 ReviewAction Schema**

```python
# backend/app/admin/Schema/ReviewAction.py
from pydantic import BaseModel

class ReviewAction(BaseModel):
    status: str | None = None   # "approved" / "rejected"
    reviewed: bool | None = None  # True
```

- [ ] **Step 2: 审核论坛帖子**

```python
@router.put("/posts/{post_id}/review",
            dependencies=[Depends(require_perm("forum:review"))])
async def review_post(post_id: int, body: ReviewAction, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(ForumPost).where(ForumPost.id == post_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "帖子不存在")
    if body.status is not None:
        p.status = body.status
    if body.reviewed is not None:
        p.reviewed = body.reviewed
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 3: 审核评论**

```python
@router.put("/posts/{post_id}/comments/{comment_id}/review",
            dependencies=[Depends(require_perm("forum:review"))])
async def review_comment(post_id: int, comment_id: int, body: ReviewAction, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(
        select(ForumPost).where(ForumPost.id == comment_id, ForumPost.thread_id == post_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "评论不存在")
    if body.status is not None:
        c.status = body.status
    if body.reviewed is not None:
        c.reviewed = body.reviewed
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: 任务列为已审核**

在现有的 `update_task_status` 中添加：

```python
# admin/Router.py update_task_status 第 298 行
t.status = body.status
t.reviewed = True  # 管理员改过状态 = 已审核
```

- [ ] **Step 5: 管理端帖子列表**

```python
@router.get("/posts", dependencies=[Depends(require_perm("forum:review"))])
async def list_posts(
    reviewed: str = Query(""), db: AsyncSession = Depends(get_db),
):
    q = select(ForumPost).where(ForumPost.thread_id.is_(None))
    if reviewed == "false":
        q = q.where(ForumPost.reviewed == False)
    q = q.order_by(ForumPost.created_at.desc())
    posts = (await db.execute(q)).scalars().all()
    return [{"id": p.id, "title": p.title, "content": p.content[:200],
             "author_name": p.author.username if p.author else "匿名",
             "board_id": p.board_id, "status": p.status,
             "reviewed": p.reviewed, "image_urls": await _resolve_images(db, p.image_ids),
             "created_at": p.created_at.isoformat()} for p in posts]
```

- [ ] **Step 6: 部署后端**

- [ ] **Step 7: Commit**

---

### Task 4: 前端 — 类型 + API

**Files:**
- Modify: `frontend/src/types/admin/index.ts`
- Modify: `frontend/src/api/admin/index.ts`

- [ ] **Step 1: 类型定义**

```typescript
// types/admin/index.ts 添加
export interface AdminPost {
  id: number; title: string; content: string;
  author_name: string; board_id: number; status: string;
  reviewed: boolean; image_urls: string[]; created_at: string;
}

// AdminTask 添加
reviewed: boolean;
```

- [ ] **Step 2: API**

```typescript
// api/admin/index.ts 添加
listPosts: (reviewed?: boolean) =>
  api.get<AdminPost[]>("/api/v1/admin/posts", { params: reviewed === undefined ? {} : { reviewed: String(reviewed) } }),

reviewPost: (id: number, data: { status?: string; reviewed?: boolean }) =>
  api.put(`/api/v1/admin/posts/${id}/review`, data),

reviewComment: (postId: number, commentId: number, data: { status?: string; reviewed?: boolean }) =>
  api.put(`/api/v1/admin/posts/${postId}/comments/${commentId}/review`, data),

listTaskComments: (taskId: number) =>
  api.get<AdminComment[]>(`/api/v1/admin/tasks/${taskId}/comments`),

reviewTask: (id: number, reviewed: boolean) =>
  api.put(`/api/v1/admin/tasks/${id}/review`, { reviewed }),
```

- [ ] **Step 3: Commit**

---

### Task 5: 前端 — 任务管理加审核过滤器

**Files:**
- Modify: `frontend/src/pages/admin/tasks/index.tsx`

- [ ] **Step 1: 加过滤标签**

在表格上方加 TabBar：

```tsx
const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");

const filteredTasks = filter === "unreviewed"
  ? tasks.filter((t) => !t.reviewed)
  : tasks;
```

- [ ] **Step 2: 详情 Modal 加"已审核"标记**

状态操作时调 `adminApi.reviewTask(id, true)`：

```tsx
const changeStatus = async (id: number, status: string) => {
  try {
    await adminApi.updateTaskStatus(id, status);
    await adminApi.reviewTask(id, true);
    message.success("状态已更新");
    load();
  } catch { /* ErrorToast */ }
};
```

- [ ] **Step 3: 部署前端**

```bash
npm run build && scp -r dist/* admin@192.168.3.21:/vol1/el-snow-elves-hub/frontend/dist/
ssh admin@192.168.3.21 "docker restart el-snow-hub-nginx"
```

- [ ] **Step 4: Commit**

---

### Task 6: 前端 — 帖子审核页面

**Files:**
- Create: `frontend/src/pages/admin/posts/index.tsx`
- Modify: `frontend/src/store/routes.ts` (注册组件)

- [ ] **Step 1: 创建 AdminPostsPage**

参考 `pages/admin/tasks/index.tsx` 结构：

```tsx
import { useEffect, useState, type FC } from "react";
import { Table, Button, Tag, Modal, Descriptions, Select, Space, Tabs } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { AdminPost } from "@/types";

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  approved: { color: "green", label: "已上架" },
  rejected: { color: "red", label: "已拒绝" },
};

const AdminPostsPage: FC = () => {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AdminPost | null>(null);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");

  const load = () => {
    setLoading(true);
    adminApi.listPosts(filter === "unreviewed" ? false : undefined)
      .then(setPosts).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter]);

  const review = async (id: number, status: string) => {
    try {
      await adminApi.reviewPost(id, { status, reviewed: true });
      message.success(status === "rejected" ? "已拒绝" : "已恢复");
      load();
    } catch { /* ErrorToast */ }
  };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <h2 className="text-[1.125rem] font-600 text-[#3d3630] mb-4">帖子审核</h2>
      <Tabs activeKey={filter} onChange={(k) => setFilter(k as any)}
        items={[
          { key: "unreviewed", label: "未审核" },
          { key: "all", label: "全部" },
        ]} />
      <Table dataSource={posts} rowKey="id" loading={loading}
        pagination={{ pageSize: 20 }} className="bg-white rounded-3"
        columns={[
          { title: "标题", dataIndex: "title", ellipsis: true },
          { title: "作者", dataIndex: "author_name", width: 100 },
          { title: "状态", dataIndex: "status", width: 80,
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label}</Tag> },
          { title: "操作", width: 200,
            render: (_: unknown, record: AdminPost) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetail(record)} />
                <Select size="small" value={record.status === "rejected" ? "rejected" : "approved"}
                  onChange={(v) => review(record.id, v)}
                  options={[{ value: "approved", label: "通过" }, { value: "rejected", label: "拒绝" }]} />
              </Space>
            ),
          },
        ]} />
      <Modal title={detail?.title} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="作者">{detail.author_name}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="内容" contentStyle={{ whiteSpace: "pre-wrap" }}>{detail.content}</Descriptions.Item>
            {detail.image_urls?.length > 0 && (
              <Descriptions.Item label="图片">
                {detail.image_urls.map((url, i) => <img key={i} src={url} className="max-w-full max-h-60 rounded-2 mb-2" />)}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export const page = "AdminPostsPage";
export default AdminPostsPage;
```

- [ ] **Step 2: Commit**

---

### Task 7: 前端 — 评论审核页面

和 Task 6 几乎一样，但显示评论类帖子（`thread_id IS NOT NULL`）。

数据库没有专门的评论表——评论也是 ForumPost 行（`parent_id` 指向被回复的帖）。管理端查询需要区分。

最简单做法：`GET /admin/posts` 加 `type` 参数，值为 `threads` / `replies`。

后端管理端查询改为：

```python
type = Query("threads")
if type == "replies":
    q = q.where(ForumPost.thread_id.isnot(None))
else:
    q = q.where(ForumPost.thread_id.is_(None))
```

- [ ] **Step 1: 修改 list_posts 支持 type 参数**
- [ ] **Step 2: 创建 AdminCommentsPage（复用 AdminPostsPage 结构，type="replies"）**
- [ ] **Step 3: 部署 + Commit**

---

### Task 8: 前端 — 导航路由注册

管理员后台侧边栏需要显示新页面。在 Seed.py 的路由初始化中或通过管理界面手动添加路由。

- [ ] **Step 1: 管理后台手动添加路由**

路径：`/admin/posts` 标题：帖子审核 图标：`MessageOutlined` 权限码：`forum:review`
路径：`/admin/comments` 标题：评论审核 图标：`CommentOutlined` 权限码：`forum:review`

- [ ] **Step 2: Commit**

---

### Task 9: 集成测试 + 部署

- [ ] **Step 1: 黑盒测试**

```bash
# 新发帖默认 approved + reviewed=false
curl -s -b cookies.txt "https://elves.elarion.cn/api/v1/forum/threads" \
  -H "Content-Type: application/json" \
  -d '{"title":"审核测试","content":"内容","board_id":1}'

# 管理端审核
curl -s -b cookies.txt "https://elves.elarion.cn/api/v1/admin/posts/17/review" \
  -H "Content-Type: application/json" -X PUT \
  -d '{"status":"approved","reviewed":true}'

# 拒绝帖子后公开不可见
curl -s "https://elves.elarion.cn/api/v1/forum/threads/17"  # 404
```

- [ ] **Step 2: Push**

---

## 执行顺序

1. Task 1: DB + Entity + Seed (后端基础)
2. Task 2: 公开端点过滤 (后端)
3. Task 3: 管理端审核端点 (后端)
4. Task 4: 前端类型 + API
5. Task 5: 任务管理加过滤器 (前端)
6. Task 6: 帖子审核页 (前端)
7. Task 7: 评论审核页 (前端)
8. Task 8: 导航路由注册
9. Task 9: 集成测试
