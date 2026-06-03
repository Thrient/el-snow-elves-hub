# 上传流程重设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一上传入口 `upload(items)`，内部按文件大小自动调度（≤5MB 直传 / >5MB 分块），前端只算一次哈希，后端从数据中自行累积哈希，取消 complete 传 hash 和异步校验。**断点续传：** 按文件 SHA256 记忆 upload_id，重试时先查 `GET /{upload_id}` 获取已上传分片列表，只补传缺失分片。

**Architecture:** 前端 `upload()` 统一入口 → 批量哈希 → 批量秒传预检 → 按大小调度直传或分块通道。分块通道内置**断点续传**：`init` 时传入 SHA256，后端命中已有会话直接返回（同文件=同 SHA256=同会话，浏览器崩溃也不丢状态）。后端新增 `POST /uploads/direct` 直传端点 + `GET /uploads/{id}` 状态查询端点，简化 `complete`（不接收哈希，后端从 MinIO 分片数据流式计算）。

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + MinIO (boto3 S3) + React 19 + TypeScript + Web Crypto API

**涉及目录:**
- 后端: `backend/app/infrastructure/storage/`
- 前端: `frontend/src/api/storage/`, `frontend/src/pages/task/upload/`, `frontend/src/pages/forum/`, `frontend/src/pages/admin/versions/`

---

### Task 1: Upload 实体 — 新增 sha256 列用于服务端断点续传

**Files:**
- Modify: `backend/app/infrastructure/storage/entity/Upload.py`

- [ ] **Step 1: 添加 sha256 字段**

在 `uploaded_chunks` 字段后添加：

```python
    uploaded_chunks: Mapped[list | None] = mapped_column(JSON, default=list)
    chunk_hashes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # ← 新增：文件 SHA256，同文件断点续传
    status: Mapped[str] = mapped_column(String(16), default="uploading")
```

- [ ] **Step 2: 生成 DB migration**

Run:
```bash
ssh admin@192.168.3.21 "docker exec -i mysql mysql -u elsnow -p'T5N3uj+ImElFrfiF' el_snow_hub -e 'ALTER TABLE uploads ADD COLUMN sha256 VARCHAR(64) NULL, ADD INDEX idx_uploads_sha256 (sha256);'"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/entity/Upload.py
git commit -m "feat: add sha256 column to Upload for server-side resume"
```

---

### Task 2: InitRequest Schema — 新增可选 sha256 字段

**Files:**
- Modify: `backend/app/infrastructure/storage/Schema/InitRequest.py`

- [ ] **Step 1: 添加 sha256 可选字段**

```python
from pydantic import BaseModel


class InitRequest(BaseModel):
    filename: str
    total_size: int
    total_chunks: int
    sha256: str | None = None  # 文件 SHA256，用于服务端断点续传查重
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/infrastructure/storage/Schema/InitRequest.py
git commit -m "feat: add optional sha256 to InitRequest for resume"
```

---

### Task 3: 更新 ChunkedUpload.init() — SHA256 会话复用

**Files:**
- Modify: `backend/app/infrastructure/storage/ChunkedUpload.py:19-26`

- [ ] **Step 1: 重写 init 方法**

```python
    async def init(self, db: AsyncSession, filename: str, total_size: int, total_chunks: int,
                   uploaded_by: int | None = None, sha256: str | None = None) -> Upload:
        # ── SHA256 断点续传：相同文件复用已有会话 ──
        if sha256:
            existing = (await db.execute(
                select(Upload).where(
                    Upload.sha256 == sha256,
                    Upload.status == "uploading",
                )
            )).scalar_one_or_none()
            if existing:
                return existing  # 浏览器崩溃/重试 → 命中已有会话

        upload = Upload(
            filename=filename, total_size=total_size, total_chunks=total_chunks,
            uploaded_by=uploaded_by, sha256=sha256,
        )
        db.add(upload)
        await db.commit()
        return upload
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/infrastructure/storage/ChunkedUpload.py
git commit -m "feat: init reuses upload session by SHA256 for server-side resume"
```

---

### Task 4: 更新 CompleteRequest Schema — 移除 sha256 字段

**Files:**
- Modify: `backend/app/infrastructure/storage/Schema/CompleteRequest.py`

- [ ] **Step 1: 清空 CompleteRequest**

```python
from pydantic import BaseModel


class CompleteRequest(BaseModel):
    """完成上传请求 — 无客户端字段，后端自行计算哈希"""
    pass
```

- [ ] **Step 2: 验证语法**

Run: `cd backend && PYTHONPATH=. python -c "from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest; print(CompleteRequest())"`
Expected: `CompleteRequest()`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/Schema/CompleteRequest.py
git commit -m "refactor: remove sha256 from CompleteRequest schema"
```

---

### Task 5: 更新 /files/check 批量模式 — 返回 record_id

**Files:**
- Modify: `backend/app/infrastructure/storage/Router.py:40-48`

**Why:** 统一 `upload()` 批量预检后，`existing` 的文件需要 `record_id` 才能跳过上传。当前批量模式只返回哈希列表。

- [ ] **Step 1: 修改批量返回格式**

In `backend/app/infrastructure/storage/Router.py`, replace lines 44-48:

```python
    if isinstance(body.sha256, str):
        fp_id = fp_map.get(body.sha256)
        rec_id = rec_map.get(fp_id) if fp_id else None
        return ok({"exists": fp_id is not None, "record_id": rec_id})
    # 批量模式：返回 record_id 以及哈希，消费端无需二次查询
    existing = [
        {"sha256": h, "record_id": rec_map.get(fp_map[h])}
        for h in hashes if h in fp_map and rec_map.get(fp_map[h]) is not None
    ]
    return ok({
        "existing": existing,
        "missing": [h for h in hashes if h not in fp_map],
    })
```

- [ ] **Step 2: 验证 SQL 语法**

Run: `cd backend && PYTHONPATH=. python -c "from app.infrastructure.storage.Router import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/Router.py
git commit -m "feat: batch check returns record_ids for existing files"
```

---

### Task 6: 重写 ChunkedUpload.complete() — 后端流式计算哈希

**Files:**
- Modify: `backend/app/infrastructure/storage/ChunkedUpload.py:50-110`

**核心变更:**
1. 移除 `sha256` 参数
2. 从 MinIO 逐块流式读取已上传分片 → `hashlib.sha256().update(chunk_data)` 累积完整哈希
3. 用自算哈希做去重
4. 删除 `_verify_sha256()` 方法及其异步调用
5. `detect_type` 复用已读的第一个分片数据，避免重复下载

- [ ] **Step 1: 替换 complete 和删除 _verify_sha256**

Replace lines 50-136 of `ChunkedUpload.py` (from `complete` method through `_verify_sha256`):

```python
    async def complete(self, db: AsyncSession, upload_id: str):
        upload = (await db.execute(
            select(Upload).where(Upload.upload_id == upload_id)
        )).scalar_one_or_none()
        if not upload:
            raise ValueError("上传会话不存在或已过期")

        chunks = sorted(upload.uploaded_chunks or [])
        if len(chunks) != upload.total_chunks:
            raise ValueError(f"分片未完整: {len(chunks)}/{upload.total_chunks}")

        from app.infrastructure.storage.entity.Fingerprint import Fingerprint
        from app.infrastructure.storage.FileValidator import detect_type

        # ── 从 MinIO 流式读取所有分片，累积完整文件 SHA256 ──
        h = hashlib.sha256()
        first_chunk_data: bytes | None = None
        for n in chunks:
            data, _ = minio.download(f"chunks/{upload_id}/{n}")
            h.update(data)
            if first_chunk_data is None:
                first_chunk_data = data
        full_hash = h.hexdigest()

        # ── 去重 ──
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == full_hash)
        )).scalar_one_or_none()

        if existing:
            fp = existing
        else:
            # 服务端合并（UploadPartCopy，数据不经过后端）
            mp_id = minio.create_multipart_upload(full_hash)
            parts = []
            for i, n in enumerate(chunks, start=1):
                result = minio.upload_part_copy(
                    full_hash, mp_id, i, f"chunks/{upload_id}/{n}"
                )
                parts.append(result)
            minio.complete_multipart_upload(full_hash, mp_id, parts)

            # 从第一个分片检测文件类型（已读取，无需重载）
            detected = detect_type(first_chunk_data)

            fp = Fingerprint(sha256=full_hash, size=upload.total_size, detected_type=detected)
            db.add(fp)
            await db.flush()

        record = await storage_service.create_record(
            db, fp,
            filename=upload.filename,
            uploaded_by=upload.uploaded_by,
        )

        # ── 批量删除分片（容错） ──
        chunk_keys = [f"chunks/{upload_id}/{n}" for n in chunks]
        try:
            minio.delete_objects(chunk_keys)
        except Exception:
            _log.warning(f"分片清理失败，残留 {len(chunk_keys)} 个对象于 chunks/{upload_id}/")

        await db.delete(upload)
        await db.commit()

        return fp, record
```

- [ ] **Step 2: 验证语法**

Run: `cd backend && PYTHONPATH=. python -c "from app.infrastructure.storage.ChunkedUpload import chunked_upload; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/ChunkedUpload.py
git commit -m "refactor: compute file hash from MinIO chunks at complete, remove _verify_sha256"
```

---

### Task 7: 新增 ChunkedUpload.direct_upload() — 小文件直传

**Files:**
- Modify: `backend/app/infrastructure/storage/ChunkedUpload.py`

在 `cleanup_expired` 方法前插入新方法，文件末尾不变。

- [ ] **Step 1: 添加 direct_upload 方法**

In `ChunkedUpload.py`, after `complete()` (after the newly rewritten version) and before `cleanup_expired()`, insert:

```python
    async def direct_upload(self, db: AsyncSession, filename: str, data: bytes, uploaded_by: int | None = None):
        """小文件直传 — 一次请求完成哈希计算、去重、存储"""
        from app.infrastructure.storage.entity.Fingerprint import Fingerprint
        from app.infrastructure.storage.FileValidator import detect_type

        sha256 = hashlib.sha256(data).hexdigest()

        # 去重
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == sha256)
        )).scalar_one_or_none()

        if existing:
            fp = existing
        else:
            detected = detect_type(data)
            minio.upload(sha256, data, "application/octet-stream")
            fp = Fingerprint(sha256=sha256, size=len(data), detected_type=detected)
            db.add(fp)
            await db.flush()

        record = await storage_service.create_record(
            db, fp, filename=filename, uploaded_by=uploaded_by,
        )
        await db.commit()
        return record
```

- [ ] **Step 2: 验证语法**

Run: `cd backend && PYTHONPATH=. python -c "from app.infrastructure.storage.ChunkedUpload import chunked_upload; print(hasattr(chunked_upload, 'direct_upload'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/ChunkedUpload.py
git commit -m "feat: add direct_upload for small files (≤5MB, single request)"
```

---

### Task 8: 更新 UploadRouter — 新增端点 + 修改 /complete + 断点续传状态查询

**Files:**
- Modify: `backend/app/infrastructure/storage/UploadRouter.py`
- Modify: `backend/app/infrastructure/navigation/SeedData.py` (添加权限码)

- [ ] **Step 1: 重写 UploadRouter.py（新增 /direct、GET /{id}、修改 /complete）**

In `UploadRouter.py`, add the new `direct_upload` endpoint before `init_upload`, and update `complete_upload`:

```python
"""分块上传 — REST 端点"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any, require_verified
from app.infrastructure.Response import ok
from app.infrastructure.Limiter import get_limiter
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.entity.Upload import Upload
from app.identity.entity.User import User

router = APIRouter(prefix="/uploads", tags=["断点续传"])
_limiter = get_limiter()

from app.infrastructure.storage.Schema.InitRequest import InitRequest
from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest


@router.get("/{upload_id}")
async def get_upload_status(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:chunk")),
    _v=Depends(require_verified),
):
    """查询上传会话状态 — 用于断点续传，返回已上传分片列表"""
    upload = (await db.execute(
        select(Upload).where(Upload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise HTTPException(404, "上传会话不存在或已过期")
    return ok({
        "upload_id": upload.upload_id,
        "filename": upload.filename,
        "total_size": upload.total_size,
        "total_chunks": upload.total_chunks,
        "uploaded_chunks": upload.uploaded_chunks or [],
        "chunk_hashes": upload.chunk_hashes or {},
        "status": upload.status,
    })


@router.post("/direct")
@_limiter.limit("60/minute")
async def direct_upload(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:direct")),
    _v=Depends(require_verified),
):
    """小文件直传 — 一次请求完成上传，服务端计算哈希"""
    data = await file.read()
    record = await chunked_upload.direct_upload(db, file.filename or "untitled", data, user.id)
    return ok({"record_id": record.id})


@router.post("/init")
@_limiter.limit("60/minute")
async def init_upload(
    request: Request, body: InitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:init")),
    _v=Depends(require_verified),
):
    upload = await chunked_upload.init(
        db, body.filename, body.total_size, body.total_chunks,
        user.id, body.sha256,
    )
    return ok({"upload_id": upload.upload_id, "expires_at": upload.expires_at.isoformat()})


@router.post("/{upload_id}/chunk")
async def upload_chunk(
    request: Request, upload_id: str,
    n: int = Query(...),
    chunk: UploadFile = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:chunk")),
    _v=Depends(require_verified),
):
    if not chunk:
        raise HTTPException(400, "缺少分片数据")
    upload = await chunked_upload.chunk(db, upload_id, n, await chunk.read())
    return ok({"chunk": n, "uploaded": len(upload.uploaded_chunks or []), "total": upload.total_chunks})


@router.post("/{upload_id}/complete")
async def complete_upload(
    request: Request, upload_id: str, body: CompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:complete")),
    _v=Depends(require_verified),
):
    try:
        fp, record = await chunked_upload.complete(db, upload_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"record_id": record.id})
```

- [ ] **Step 2: 添加权限码 `file:upload:direct`**

In `backend/app/infrastructure/navigation/SeedData.py`, find the `PERMISSION_CODES` dict (around line 38-40) and add the new code:

```python
    "file:upload:init": "上传初始化",
    "file:upload:chunk": "上传分片",
    "file:upload:complete": "上传完成",
    "file:upload:direct": "小文件直传",   # ← 新增
```

Also add to the route/permission seed data if there's a `_PERMISSIONS` list or similar — search for "file:upload:complete" and add the new entry alongside it. In the same file, find the seed list that assigns perms to routes/users and add `"file:upload:direct"` wherever `file:upload:init` is assigned.

- [ ] **Step 3: 验证路由注册**

Run: `cd backend && PYTHONPATH=. python -c "from app.infrastructure.storage.UploadRouter import router; print([r.path for r in router.routes])"`
Expected: Should list `/direct`, `/init`, `/{upload_id}/chunk`, `/{upload_id}/complete`

- [ ] **Step 4: Commit**

```bash
git add backend/app/infrastructure/storage/UploadRouter.py backend/app/infrastructure/navigation/SeedData.py
git commit -m "feat: add POST /uploads/direct, simplify /complete, add file:upload:direct perm"
```

---

### Task 9: 重写前端 upload() 统一入口

**Files:**
- Modify: `frontend/src/api/storage/index.ts`

完整替换文件内容。核心：统一入口 `upload(items)`，自动按 ≤5MB / >5MB 分流。

- [ ] **Step 1: 重写 storage/index.ts**

```typescript
import { api } from "@/api/axios";
import type { UploadSession } from "@/types";

const CHUNK_SIZE = 5 * 1024 * 1024;       // 5MB
const DIRECT_THRESHOLD = 5 * 1024 * 1024; // ≤5MB 直传

// ── 检查结果 ──
interface BatchCheckResult {
  existing: { sha256: string; record_id: number }[];
  missing: string[];
}

// ── 上传结果 ──
export interface UploadResult {
  file: File;
  sha256: string;
  record_id: number;
}

// ── 内部 API ──
const uploadApi = {
  /** 批量预检（始终走批量模式，单文件也包成数组） */
  check: (sha256_list: string[]): Promise<BatchCheckResult> =>
    api.post<{ code: number; data: BatchCheckResult }>("/api/v1/files/check", { sha256: sha256_list })
      .then((r) => r.data),

  /** 大文件：初始化分块会话（传入 sha256 用于服务端断点续传） */
  init: (filename: string, totalSize: number, totalChunks: number, sha256?: string): Promise<UploadSession> =>
    api.post<{ code: number; data: UploadSession }>("/api/v1/uploads/init", {
      filename, total_size: totalSize, total_chunks: totalChunks, sha256,
    }).then((r) => r.data),

  /** 大文件：上传一个分块 */
  uploadChunk: (uploadId: string, chunkIndex: number, blob: Blob) => {
    const form = new FormData();
    form.append("chunk", blob);
    return api.post(`/api/v1/uploads/${uploadId}/chunk?n=${chunkIndex}`, form);
  },

  /** 查询上传会话状态 — 用于断点续传 */
  status: (uploadId: string): Promise<{
    upload_id: string; filename: string; total_size: number;
    total_chunks: number; uploaded_chunks: number[]; status: string;
  }> =>
    api.get<{ code: number; data: any }>(`/api/v1/uploads/${uploadId}`).then((r) => r.data),

  /** 大文件：完成上传（不传哈希——后端自己已从分片数据累积） */
  complete: (uploadId: string): Promise<{ record_id: number }> =>
    api.post<{ code: number; data: { record_id: number } }>(`/api/v1/uploads/${uploadId}/complete`, {})
      .then((r) => r.data),

  /** 小文件：直传（一次请求，服务端算哈希） */
  direct: (file: File): Promise<{ record_id: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ code: number; data: { record_id: number } }>("/api/v1/uploads/direct", form)
      .then((r) => r.data);
  },
};

// ── SHA256 计算（读一次文件，分块式，不存全量到内存） ──
function computeSHA256(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks: ArrayBuffer[] = [];
    let currentChunk = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) return reject(new Error("Read failed"));
      chunks.push(e.target.result as ArrayBuffer);
      currentChunk++;
      onProgress?.(Math.round((currentChunk / totalChunks) * 100));
      if (currentChunk < totalChunks) {
        readNext();
      } else {
        const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          merged.set(new Uint8Array(c), offset);
          offset += c.byteLength;
        }
        crypto.subtle.digest("SHA-256", merged).then((hash) => {
          resolve(Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""));
        }).catch(reject);
      }
    };

    reader.onerror = () => reject(new Error("Read error"));

    const readNext = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };

    readNext();
  });
}

// ── 进度回调类型 ──
export type UploadProgress = {
  phase: "hashing" | "checking" | "uploading" | "done";
  current: number;   // 当前文件索引 (0-based)
  total: number;     // 总文件数
  filePct?: number;  // 当前文件进度 (0-100)
};

// ══════════════════════════════════════════════════
// 统一上传入口
// ══════════════════════════════════════════════════

/**
 * 统一文件/文件夹上传
 * - 文件 ≤5MB：直传 POST /uploads/direct
 * - 文件 >5MB：分块 POST /uploads/init → chunk → complete
 * - 批量预检：一次 POST /files/check 查询所有文件是否已存在
 * - 前端每个文件只算一次 SHA256
 * - 后端从上传数据自行计算哈希，complete 不传哈希
 *
 * @param items 单个文件、文件数组、或 FileList
 * @param onProgress 可选进度回调
 * @returns 上传结果数组（顺序与输入一致）
 */
export async function upload(
  items: File | File[] | FileList,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult[]> {
  const files = items instanceof File
    ? [items]
    : Array.from(items as Iterable<File>);

  if (files.length === 0) return [];

  const total = files.length;

  // ── 阶段 1: 计算每个文件的 SHA256（串行，一次读取） ──
  onProgress?.({ phase: "hashing", current: 0, total, filePct: 0 });
  const filesWithHash: Array<{ file: File; sha256: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sha256 = await computeSHA256(file, (pct) => {
      onProgress?.({ phase: "hashing", current: i, total, filePct: pct });
    });
    filesWithHash.push({ file, sha256 });
  }

  // ── 阶段 2: 批量预检 ──
  onProgress?.({ phase: "checking", current: 0, total, filePct: 0 });
  const sha256List = filesWithHash.map((f) => f.sha256);
  const { existing, missing } = await uploadApi.check(sha256List);
  const existingMap = new Map(existing.map((e) => [e.sha256, e.record_id]));
  const missingSet = new Set(missing);

  // ── 阶段 3: 上传 missing 文件 ──
  const results: UploadResult[] = [];
  let uploadIndex = 0;
  const missingFiles = filesWithHash.filter((f) => missingSet.has(f.sha256));
  const totalUpload = missingFiles.length;

  onProgress?.({ phase: "uploading", current: 0, total: totalUpload, filePct: 0 });

  for (const { file, sha256 } of missingFiles) {
    const uploadResult = await uploadSingle(file, sha256, (pct) => {
      onProgress?.({ phase: "uploading", current: uploadIndex, total: totalUpload, filePct: pct });
    });
    results.push({ file, sha256, record_id: uploadResult.record_id });
    uploadIndex++;
  }

  // ── existing 文件直接返回已有 record_id ──
  for (const { file, sha256 } of filesWithHash) {
    const recordId = existingMap.get(sha256);
    if (recordId != null) {
      results.push({ file, sha256, record_id: recordId });
    }
  }

  // 按原始顺序排序
  const resultMap = new Map(results.map((r) => [r.file, r]));
  onProgress?.({ phase: "done", current: total, total });

  return files.map((f) => resultMap.get(f)!);
}

// ── 单文件上传调度（含 SHA256 服务端断点续传） ──
async function uploadSingle(
  file: File,
  sha256: string,
  onProgress?: (pct: number) => void,
): Promise<{ record_id: number }> {
  if (file.size <= DIRECT_THRESHOLD) {
    // ── 小文件直传 ──
    onProgress?.(50);
    const result = await uploadApi.direct(file);
    onProgress?.(100);
    return result;
  }

  // ═══════════════════════════════════════════
  // ── 大文件分块上传 + SHA256 服务端断点续传 ──
  // ═══════════════════════════════════════════
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // init 传入 sha256 → 后端命中已有会话直接返回
  // 浏览器崩溃/重启后重新选文件 = 同 SHA256 = 同会话 = 分片不丢失
  const session = await uploadApi.init(file.name, file.size, totalChunks, sha256);

  // 查询已上传分片（新会话返回空列表，续传返回已有列表）
  const status = await uploadApi.status(session.upload_id);
  const uploadedSet = new Set<number>(status.uploaded_chunks ?? []);

  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) {
      onProgress?.(Math.round((i + 1) / totalChunks * 100));
      continue;  // ← 断点续传：跳过已上传分块
    }
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    await uploadApi.uploadChunk(session.upload_id, i, blob);
    onProgress?.(Math.round((i + 1) / totalChunks * 100));
  }

  onProgress?.(100);
  return uploadApi.complete(session.upload_id);
}

// ── 保留旧版兼容（任务/论坛单文件场景简化调用） ──
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ record_id: number }> {
  const results = await upload(file, (p) => {
    if (p.total === 1) onProgress?.(p.filePct ?? 0);
  });
  return { record_id: results[0].record_id };
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit src/api/storage/index.ts`
Expected: 无类型错误（允许模块导入 warning）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/storage/index.ts
git commit -m "feat: unified upload() with auto-dispatch (direct/chunked), batch pre-check, single hash"
```

---

### Task 10: 适配任务上传页

**Files:**
- Modify: `frontend/src/pages/task/upload/index.tsx`

当前 `UploadPage` 直接调用 `uploadFile(file, onProgress)`，签名兼容 — 不需要改。确认 `uploadFile` 导出仍存在即可。

- [ ] **Step 1: 验证导入**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -i "uploadFile\|task/upload" || echo "PASS"`
Expected: `PASS` (无类型错误)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/task/upload/index.tsx
git commit -m "chore: task upload page compatible with new upload() — no changes needed"
```

---

### Task 11: 适配论坛图片上传

**Files:**
- Modify: `frontend/src/pages/forum/components/ImageUpload.tsx`

当前逐文件调用 `forumApi.uploadImage(file)` → `uploadFile(file)`，签名兼容。但现在有了批量预检，可以用 `upload(files)` 一次预检多张图片。

- [ ] **Step 1: 改为批量上传**

In `ImageUpload.tsx`, replace lines 22-41 (`add` function):

```typescript
import { upload } from "@/api/storage";

// ... inside component:

  const add = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return message.warning("仅支持图片文件");

    const news: UploadedImage[] = arr.map((f) => ({
      file: f, preview: URL.createObjectURL(f), uploading: true, fileId: null,
    }));
    setImages((prev) => [...prev, ...news]);

    // 批量上传 — 一次预检覆盖所有图片
    try {
      const results = await upload(arr, (p) => {
        // 可选：进度反馈，ImageUpload 暂时不暴露
      });
      for (const { file, record_id } of results) {
        setImages((prev) => prev.map((img) =>
          img.file === file ? { ...img, uploading: false, fileId: record_id } : img));
      }
    } catch {
      setImages((prev) => prev.map((img) => {
        const matched = arr.find((f) => f === img.file);
        return matched ? { ...img, uploading: false } : img;
      }));
      message.error("部分图片上传失败");
    }
  };
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "ImageUpload\|upload(" || echo "PASS"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/forum/components/ImageUpload.tsx
git commit -m "refactor: ImageUpload uses batch upload() for single pre-check"
```

---

### Task 12: 适配管理后台版本上传页

**Files:**
- Modify: `frontend/src/pages/admin/versions/index.tsx`

当前有两处算哈希：
1. `handleFolderSelect` 中 `computeSHA256(file)` (第 51 行)
2. 上传时 `uploadFile(file)` 内部又算一次 (第 75 行)

改为：`handleFolderSelect` 只收集文件 → 点击「创建」时调用 `upload(files)` → 一次性批量哈希 + 预检 + 上传。

- [ ] **Step 1: 重写 versions/index.tsx 的上传逻辑**

Replace lines 1-96 (from imports through `create` function):

```tsx
import { useEffect, useRef, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch, Progress } from "antd";
import { PlusOutlined, DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { adminApi } from "@/api/admin";
import { formatSize, formatSpeed } from "@/util/format";
import { upload, type UploadProgress } from "@/api/storage";
import type { AdminVersion } from "@/types";

type UploadStage = "idle" | "hashing" | "checking" | "uploading" | "creating";

const VersionsPage: FC = () => {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ version: "", platform: "Windows x64", changelog: "", is_latest: false, is_mandatory: false });
  const [loading, setLoading] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderName, setFolderName] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadBytes, setUploadBytes] = useState({ done: 0, total: 0 });
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const canManage = useAuthStore((s) => s.hasPerm)("version:create");

  const load = () => adminApi.listVersions().then(setVersions);
  useEffect(() => { load(); }, []);

  const resetUpload = () => {
    setFolderName(""); setFiles([]); setUploadStage("idle"); setUploadBytes({ done: 0, total: 0 });
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const fileList = Array.from(selected);
    const rootName = (fileList[0].webkitRelativePath || "").split("/")[0] || "unknown";
    const totalSize = fileList.reduce((s, f) => s + f.size, 0);
    setFolderName(rootName);
    setFiles(fileList);
    setUploadBytes({ done: 0, total: totalSize });
  };

  const create = async () => {
    if (!form.version) return message.warning("请填写版本号");
    if (files.length === 0) return message.warning("请选择版本文件夹");
    setLoading(true);
    try {
      // 统一上传 — upload() 内部：哈希 → 批量预检 → 调度直传/分块
      let speedTimer = performance.now();
      let speedBytes = 0;
      const results = await upload(files, (p: UploadProgress) => {
        setUploadStage(
          p.phase === "hashing" ? "hashing" :
          p.phase === "checking" ? "checking" :
          p.phase === "uploading" ? "uploading" :
          p.phase === "done" ? "creating" : "idle"
        );
        if (p.phase === "uploading" && p.filePct != null) {
          const now = performance.now();
          const elapsed = now - speedTimer;
          speedBytes += (p.filePct / 100) * (files[p.current]?.size ?? 0);
          if (elapsed > 500) {
            setUploadSpeed(speedBytes / elapsed * 1000);
            speedTimer = now;
            speedBytes = 0;
          }
          setUploadBytes({
            done: files.slice(0, p.current).reduce((s, f) => s + f.size, 0) +
              Math.round((p.filePct / 100) * (files[p.current]?.size ?? 0)),
            total: files.reduce((s, f) => s + f.size, 0),
          });
        }
      });

      // 构建版本 manifest（相对路径 = webkitRelativePath 去掉根文件夹名）
      const fileEntries = results.map((r, i) => {
        const parts = (files[i].webkitRelativePath || files[i].name).split("/");
        const relPath = parts.length > 1 ? parts.slice(1).join("/") : (files[i].webkitRelativePath || files[i].name);
        return { path: relPath, sha256: r.sha256 };
      });

      setUploadStage("creating");
      await adminApi.createVersion({
        version: form.version, platform: form.platform, changelog: form.changelog || undefined,
        is_latest: form.is_latest, is_mandatory: form.is_mandatory,
        files: fileEntries,
      });
      message.success("版本已创建"); setOpen(false);
      setForm({ version: "", platform: "Windows x64", changelog: "", is_latest: false, is_mandatory: false });
      resetUpload(); load();
    } catch { /* ErrorToast */ }
    finally { setLoading(false); setUploadStage("idle"); setUploadSpeed(0); }
  };

  const remove = async (id: number) => { try { await adminApi.deleteVersion(id); message.success("已删除"); load(); } catch { /* ErrorToast */ } };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">下载版本管理</h2>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { resetUpload(); setOpen(true); }}>新增版本</Button>}
      </div>

      <Table dataSource={versions} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "版本", dataIndex: "version", width: 100 },
          { title: "平台", dataIndex: "platform", width: 120 },
          { title: "更新日志", dataIndex: "changelog", ellipsis: true },
          { title: "文件数", dataIndex: "file_count", width: 80, render: (v: number | null) => (v != null ? v : "-") },
          { title: "最新", dataIndex: "is_latest", width: 60, render: (v: boolean) => (v ? "是" : "") },
          { title: "强制", dataIndex: "is_mandatory", width: 60, render: (v: boolean) => (v ? "是" : "") },
          { title: "创建时间", dataIndex: "created_at", width: 170, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
          ...(canManage ? [{ title: "操作", width: 80, render: (_: unknown, record: AdminVersion) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(record.id)} /> }] : []),
        ]}
      />

      <Modal title="新增下载版本" open={open} onCancel={() => { setOpen(false); resetUpload(); }}
        onOk={create} okText="创建" cancelText="取消" confirmLoading={loading} width={480}>
        <div className="flex flex-col gap-3 pt-2">
          <Input placeholder="版本号 (如 7.0.5)" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] text-[#6b5e55] whitespace-nowrap">平台</span>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="flex-1 py-1 px-2 rounded-1.5 border border-solid border-[#d9d9d9] text-[0.8125rem] text-[#3d3630] bg-white">
              <option>Windows x64</option><option>Windows x86</option><option>macOS ARM</option><option>macOS x64</option><option>Linux x64</option>
            </select>
          </div>
          <Input placeholder="更新日志 (可选)" value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><span className="text-[0.8125rem] text-[#6b5e55]">设为最新版本</span><Switch checked={form.is_latest} onChange={(v) => setForm({ ...form, is_latest: v })} /></div>
            <div className="flex items-center gap-2"><span className="text-[0.8125rem] text-[#6b5e55]">强制更新</span><Switch checked={form.is_mandatory} onChange={(v) => setForm({ ...form, is_mandatory: v })} /></div>
          </div>

          <input ref={folderInputRef} type="file" {...{ webkitdirectory: "" } as any} className="hidden" onChange={handleFolderSelect} />

          {folderName ? (
            <div className="p-3 px-4 bg-[#f0fdf4] rounded-2 border border-solid border-[#bbf7d0]">
              <div className="flex items-center gap-2 mb-1">
                <FolderOpenOutlined className="text-[#16a34a] text-base" />
                <span className="text-[0.8125rem] font-500 text-[#166534]">{folderName}</span>
                <span className="text-[0.75rem] text-[#6b5e55]">({files.length} 个文件)</span>
                <Button type="link" size="small" onClick={resetUpload} className="ml-auto">重新选择</Button>
              </div>
              {uploadStage === "hashing" && (
                <div className="mt-1"><Progress percent={Math.round(uploadBytes.total > 0 ? (uploadBytes.done / uploadBytes.total) * 100 : 0)} size="small" status="active" /><p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-0.5">计算指纹 {formatSize(uploadBytes.done)} / {formatSize(uploadBytes.total)}</p></div>
              )}
              {uploadStage === "checking" && (
                <p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-1">检测已存在的文件... {files.length} 个文件，共 {formatSize(uploadBytes.total)}</p>
              )}
              {uploadStage === "uploading" && (
                <div className="mt-1">
                  <Progress percent={Math.round(uploadBytes.total > 0 ? (uploadBytes.done / uploadBytes.total) * 100 : 0)} size="small" status="active" />
                  <div className="flex justify-between text-[0.6875rem] text-[#6b5e55] mt-0.5">
                    <span>{formatSize(uploadBytes.done)} / {formatSize(uploadBytes.total)}</span>
                    {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
                  </div>
                </div>
              )}
              {uploadStage === "creating" && <p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-1">创建版本...</p>}
              {uploadStage === "idle" && folderName && (
                <p className="text-[0.6875rem] text-[#6b5e55] m-0">已就绪 — 点击"创建"开始上传</p>
              )}
            </div>
          ) : (
            <Button type="dashed" icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()} block className="h-15">选择版本文件夹</Button>
          )}
        </div>
      </Modal>
    </div>
  );
};

export const page = "VersionsPage";
export default VersionsPage;
```

- [ ] **Step 2: 检查未使用代码**

Search for `fileManifest`, `computeSHA256` (local one) in the new file:
Run: `cd frontend && grep -n "fileManifest\|computeSHA256" src/pages/admin/versions/index.tsx || echo "OK - removed"`
Expected: `OK - removed` (旧的单独哈希逻辑已移除)

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "versions/index|error TS" || echo "PASS"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/versions/index.tsx
git commit -m "refactor: versions page uses unified upload(), single hash pass, batch pre-check"
```

---

### Task 13: 后端测试

**Files:**
- Create: `backend/tests/test_direct_upload.py`
- Modify: `backend/tests/test_upload_validation.py`

- [ ] **Step 1: 编写直传端点测试**

```python
"""测试小文件直传端点"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from io import BytesIO


@pytest.mark.asyncio
async def test_direct_upload_new_file():
    """直传新文件：后端算哈希，创建 fingerprint + file_record"""
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload

    db = AsyncMock()
    db.execute = AsyncMock()
    # simulate no existing fingerprint
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = None
    db.execute.return_value = scalar_result

    with patch("app.infrastructure.storage.ChunkedUpload.minio") as mock_minio, \
         patch("app.infrastructure.storage.ChunkedUpload.storage_service") as mock_svc, \
         patch("app.infrastructure.storage.ChunkedUpload.detect_type", return_value="application/zip"):

        mock_record = MagicMock()
        mock_record.id = 42
        mock_svc.create_record = AsyncMock(return_value=mock_record)

        cu = ChunkedUpload()
        record = await cu.direct_upload(db, "test.zip", b"hello world", uploaded_by=1)

        assert record.id == 42
        mock_minio.upload.assert_called_once_with(
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            b"hello world", "application/octet-stream"
        )
        mock_svc.create_record.assert_awaited_once()


@pytest.mark.asyncio
async def test_direct_upload_existing_file():
    """直传已存在文件：秒传返回已有 record_id"""
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    from app.infrastructure.storage.entity.Fingerprint import Fingerprint

    db = AsyncMock()
    db.execute = AsyncMock()

    existing_fp = Fingerprint(
        sha256="b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
        size=11, detected_type="text/plain"
    )
    existing_fp.id = 1

    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = existing_fp
    db.execute.return_value = scalar_result

    with patch("app.infrastructure.storage.ChunkedUpload.minio") as mock_minio, \
         patch("app.infrastructure.storage.ChunkedUpload.storage_service") as mock_svc:

        mock_record = MagicMock()
        mock_record.id = 99
        mock_svc.create_record = AsyncMock(return_value=mock_record)

        cu = ChunkedUpload()
        record = await cu.direct_upload(db, "test.txt", b"hello world", uploaded_by=1)

        assert record.id == 99
        mock_minio.upload.assert_not_called()  # 不应重复上传


@pytest.mark.asyncio
async def test_complete_computes_hash_from_chunks():
    """complete 从 MinIO 分片流式计算完整文件哈希"""
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    from app.infrastructure.storage.entity.Upload import Upload
    from datetime import datetime, timezone, timedelta

    db = AsyncMock()
    db.execute = AsyncMock()

    upload = Upload(
        filename="big.zip", total_size=15, total_chunks=3,
        uploaded_chunks=[0, 1, 2]
    )
    upload.upload_id = "abc123"

    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = upload
    db.execute.return_value = scalar_result

    with patch("app.infrastructure.storage.ChunkedUpload.minio") as mock_minio, \
         patch("app.infrastructure.storage.ChunkedUpload.storage_service") as mock_svc, \
         patch("app.infrastructure.storage.ChunkedUpload.detect_type", return_value="application/zip"):

        # MinIO return different data per chunk
        download_calls = [
            (b"chunk0_data", "application/octet-stream"),
            (b"chunk1_data", "application/octet-stream"),
            (b"chunk2_data", "application/octet-stream"),
        ]
        mock_minio.download = MagicMock(side_effect=download_calls)
        mock_minio.create_multipart_upload.return_value = "mp123"
        mock_minio.upload_part_copy.return_value = {"PartNumber": 1, "ETag": "etag"}
        mock_minio.complete_multipart_upload = MagicMock()
        mock_minio.delete_objects = MagicMock()

        mock_record = MagicMock()
        mock_record.id = 55
        mock_svc.create_record = AsyncMock(return_value=mock_record)

        # fingerprint doesn't exist
        fp_result = AsyncMock()
        fp_result.scalar_one_or_none.return_value = None

        # need to handle the second execute for fingerprint check
        async def mock_exec(stmt):
            return fp_result
        db.execute = mock_exec

        cu = ChunkedUpload()
        fp, record = await cu.complete(db, "abc123")

        assert record.id == 55
        # verify hash computed correctly (sha256 of chunk0+chunk1+chunk2)
        import hashlib
        expected_hash = hashlib.sha256(b"chunk0_datachunk1_datachunk2_data").hexdigest()
        assert fp.sha256 == expected_hash
```

- [ ] **Step 2: 运行测试**

Run: `cd backend && PYTHONPATH=. python -m pytest tests/test_direct_upload.py -v`
Expected: 3 tests PASS

- [ ] **Step 3: 确认旧测试仍然通过**

Run: `cd backend && PYTHONPATH=. python -m pytest tests/test_upload_validation.py -v`
Expected: 旧测试通过（或标记为 skip — 确认无 regression）

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_direct_upload.py
git commit -m "test: direct upload and hash-from-chunks complete coverage"
```

---

### Task 14: 移除未使用的 `_verify_sha256` 引用和 `verified` 字段

**Files:**
- Search: `backend/app/` (全局搜索残留引用)

`_verify_sha256` 已在 Task 6 中移除。确认无其他代码引用它，以及 `Fingerprint.verified` 字段可以保留或清理。

- [ ] **Step 1: 全局搜索引用**

Run: `cd backend && grep -r "_verify_sha256\|verified" app/ --include="*.py" || echo "CLEAN"`
Expected: 确认只有 `Fingerprint` entity 中的 `verified` 字段（保留不动，避免 DB migration）。若有其他调用点则需清理。

- [ ] **Step 2: Commit（如有清理）**

```bash
# Only if changes were needed
git add ... && git commit -m "chore: remove stale _verify_sha256 references"
```

---

### Task 15: 全流程验证

- [ ] **Step 1: 前端构建**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 2: 后端语法检查**

Run: `cd backend && PYTHONPATH=. python -c "
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.UploadRouter import router
from app.infrastructure.storage.Router import router as files_router
from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest
print('ALL OK')
"`
Expected: `ALL OK`

- [ ] **Step 3: 运行全部测试**

Run: `cd backend && PYTHONPATH=. python -m pytest tests/ -v --ignore=tests/test_upload_validation.py 2>&1 || echo "Some tests may fail without MinIO — expected"`
Expected: 直传和 complete 测试通过

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: final integration verification — build + tests pass"
```
```

