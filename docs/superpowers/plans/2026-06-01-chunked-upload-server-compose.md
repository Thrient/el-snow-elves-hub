# 分块上传服务端合并 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `complete()` 改为 MinIO 服务端合并（UploadPartCopy），消除下载-重上传循环，前端传 SHA256 实现异步验证、毫秒返回。

**Architecture:** Chunk 阶段仍写 MinIO 分片 + 记 chunk SHA256。Complete 阶段用 S3 multipart copy 在 MinIO 服务端合并 chunks → 前端 SHA256 直接写指纹 → 异步后台下载验证。MinioClient 新增 4 个 S3 方法，ChunkedUpload.chunk()/complete() 重写，Upload 模型加 chunk_hashes JSON 字段，UploadRouter 接受 sha256 参数，前端 uploadFile() 传 sha256 给 complete。

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2.0 (async), MinIO (boto3 S3 client), React 19 + TypeScript

---

## File Structure

```
backend/app/
├── infrastructure/storage/
│   ├── MinioClient.py          # MODIFY: +create_multipart_upload,+upload_part_copy,+complete_multipart_upload,+delete_objects
│   ├── ChunkedUpload.py        # MODIFY: chunk() 记 hash, complete() 用 compose+异步验
│   ├── StorageService.py       # NO CHANGE (保留 store() 供其他调用方)
│   ├── entity/
│   │   └── Upload.py           # MODIFY: +chunk_hashes JSON 字段
│   └── Schema/
│       └── CompleteRequest.py  # CREATE:  complete 请求体含 sha256
├── UploadRouter.py             # MODIFY: complete 端点接受 CompleteRequest
│
backend/tests/
└── test_chunked_compose.py     # CREATE: 测试 compose 流程

frontend/src/api/storage/
└── index.ts                    # MODIFY: uploadFile() 传 sha256 到 complete()
```

---

### Task 1: Upload 模型添加 chunk_hashes 字段

**Files:**
- Modify: `backend/app/infrastructure/storage/entity/Upload.py`

- [ ] **Step 1: 添加 chunk_hashes JSON 列**

```python
from sqlalchemy import JSON

# 在 Upload 类中添加：
chunk_hashes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 2: 生成并运行 Alembic 迁移**

```bash
cd backend
alembic revision --autogenerate -m "add chunk_hashes to uploads"
alembic upgrade head
```

如果 Alembic 不可用，手动 SQL：
```sql
ALTER TABLE uploads ADD COLUMN chunk_hashes JSON NULL;
```

- [ ] **Step 3: 验证模型可正常导入**

```bash
cd backend && python -c "from app.infrastructure.storage.entity.Upload import Upload; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/infrastructure/storage/entity/Upload.py
git commit -m "feat: add chunk_hashes JSON column to Upload model"
```

---

### Task 2: MinioClient 添加 S3 multipart 方法

**Files:**
- Modify: `backend/app/infrastructure/storage/MinioClient.py`
- Create: `backend/tests/test_chunked_compose.py`

- [ ] **Step 1: 写测试 — 验证 create_multipart_upload + upload_part_copy + complete + delete_objects 全流程**

```python
"""TDD: MinIO 服务端合并 chunks — S3 multipart copy"""
import hashlib
import pytest
from app.infrastructure.storage.MinioClient import client as minio


class TestMinioMultipartCompose:
    @pytest.fixture(autouse=True)
    def _setup(self):
        self.bucket = "test-compose"
        self.chunk_prefix = f"test-chunks-{hashlib.sha256(b'ts').hexdigest()[:8]}"
        self.final_key = f"test-final-{hashlib.sha256(b'ts').hexdigest()[:8]}"
        # Setup: upload 3 test chunks
        self.chunk_data = [b"AAAAA" * 100000, b"BBBBB" * 100000, b"CCCCC" * 100000]
        self.chunk_keys = []
        for i, data in enumerate(self.chunk_data):
            key = f"{self.chunk_prefix}/{i}"
            minio.upload(key, data)
            self.chunk_keys.append(key)
        yield
        # Teardown: clean up all test objects
        try:
            minio.delete_objects(self.chunk_keys + [self.final_key])
        except Exception:
            pass

    def test_multipart_compose_assembles_correctly(self):
        """服务端合并后下载验证内容等于原始拼接"""
        # Create multipart upload
        mp_id = minio.create_multipart_upload(self.final_key)

        # Copy each chunk as a part
        parts = []
        for i, key in enumerate(self.chunk_keys, start=1):
            result = minio.upload_part_copy(self.final_key, mp_id, i, key)
            parts.append(result)

        # Complete
        minio.complete_multipart_upload(self.final_key, mp_id, parts)

        # Verify: download and check content
        downloaded, _ = minio.download(self.final_key)
        expected = b"".join(self.chunk_data)
        assert downloaded == expected, f"Size mismatch: {len(downloaded)} vs {len(expected)}"

    def test_delete_objects_batch_removes_all(self):
        """批量删除应移除所有指定对象"""
        test_keys = [f"{self.chunk_prefix}/delete-test-{i}" for i in range(3)]
        for key in test_keys:
            minio.upload(key, b"x" * 100)

        minio.delete_objects(test_keys)

        for key in test_keys:
            with pytest.raises(Exception):
                minio.download(key)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && python -m pytest tests/test_chunked_compose.py::TestMinioMultipartCompose -v
```
Expected: FAIL — `AttributeError: 'MinioClient' object has no attribute 'create_multipart_upload'`

- [ ] **Step 3: 实现 4 个新方法**

在 `MinioClient` 类中添加：

```python
def create_multipart_upload(self, key: str, content_type: str = "application/octet-stream") -> str:
    """创建分片合并上传，返回 UploadId"""
    resp = self._client.create_multipart_upload(
        Bucket=self._bucket, Key=key, ContentType=content_type,
    )
    return resp["UploadId"]

def upload_part_copy(self, key: str, upload_id: str, part_number: int, source_key: str) -> dict:
    """从已有对象复制一个分片（服务端操作，零数据传输）"""
    resp = self._client.upload_part_copy(
        Bucket=self._bucket, Key=key, UploadId=upload_id,
        PartNumber=part_number,
        CopySource={"Bucket": self._bucket, "Key": source_key},
    )
    return {"PartNumber": part_number, "ETag": resp["CopyPartResult"]["ETag"]}

def complete_multipart_upload(self, key: str, upload_id: str, parts: list[dict]):
    """完成分片合并"""
    self._client.complete_multipart_upload(
        Bucket=self._bucket, Key=key, UploadId=upload_id,
        MultipartUpload={"Parts": parts},
    )

def delete_objects(self, keys: list[str]):
    """批量删除对象（最多 1000 个）"""
    if not keys:
        return
    self._client.delete_objects(
        Bucket=self._bucket,
        Delete={"Objects": [{"Key": k} for k in keys]},
    )
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && python -m pytest tests/test_chunked_compose.py::TestMinioMultipartCompose -v
```
Expected: 2 PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/infrastructure/storage/MinioClient.py backend/tests/test_chunked_compose.py
git commit -m "feat: add S3 multipart compose methods to MinioClient"
```

---

### Task 3: ChunkedUpload.chunk() 记录分片 hash

**Files:**
- Modify: `backend/app/infrastructure/storage/ChunkedUpload.py`

- [ ] **Step 1: 修改 chunk() 方法**

将 `chunk()` 方法改为（在现有逻辑基础上加 `import hashlib` 和 hash 记录）：

```python
import hashlib

async def chunk(self, db: AsyncSession, upload_id: str, n: int, data: bytes) -> Upload:
    upload = (await db.execute(
        select(Upload).where(Upload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise ValueError("上传会话不存在或已过期")

    minio.upload(f"chunks/{upload_id}/{n}", data, "application/octet-stream")

    # 记录 chunk SHA256
    chunk_hash = hashlib.sha256(data).hexdigest()
    hashes = dict(upload.chunk_hashes or {})
    hashes[str(n)] = chunk_hash
    upload.chunk_hashes = hashes

    chunks = list(upload.uploaded_chunks or [])
    if n not in chunks:
        chunks.append(n)
    upload.uploaded_chunks = sorted(chunks)
    await db.commit()
    return upload
```

- [ ] **Step 2: 验证现有测试不受影响**

```bash
cd backend && python -m pytest tests/test_upload_validation.py -v
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/ChunkedUpload.py
git commit -m "feat: record chunk SHA256 during upload"
```

---

### Task 4: ChunkedUpload.complete() 改为服务端合并 + 异步验证

**Files:**
- Modify: `backend/app/infrastructure/storage/ChunkedUpload.py`

- [ ] **Step 1: 写测试 — complete 应毫秒返回，文件内容正确**

在 `tests/test_chunked_compose.py` 中添加：

```python
import asyncio
import io
import pytest_asyncio
from sqlalchemy import select
from app.infrastructure.Database import async_session
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.MinioClient import client as minio


class TestChunkedUploadFastComplete:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self.test_data = b"X" * (5 * 1024 * 1024 + 12345)  # ~5MB + extra
        self.test_sha256 = hashlib.sha256(self.test_data).hexdigest()
        self.chunk_size = 5 * 1024 * 1024
        self._cleanup_keys = []

        async with async_session() as db:
            total_chunks = 3  # 5MB + 5MB + ~12KB
            upload = await chunked_upload.init(
                db, "test.bin", len(self.test_data), total_chunks
            )
            self.upload_id = upload.upload_id

            # Upload chunks
            for i in range(total_chunks):
                start = i * self.chunk_size
                end = min(start + self.chunk_size, len(self.test_data))
                chunk_data = self.test_data[start:end]
                await chunked_upload.chunk(db, self.upload_id, i, chunk_data)
                self._cleanup_keys.append(f"chunks/{self.upload_id}/{i}")

        yield

        # Teardown
        try:
            minio.delete_objects(self._cleanup_keys + [self.test_sha256])
        except Exception:
            pass

    @pytest.mark.asyncio
    async def test_complete_returns_fast_and_file_is_correct(self):
        """complete() 应快速返回，且合并后的文件内容正确"""
        import time

        async with async_session() as db:
            t0 = time.monotonic()
            fp, record = await chunked_upload.complete(db, self.upload_id, self.test_sha256)
            elapsed = time.monotonic() - t0

            assert fp.sha256 == self.test_sha256
            assert record.filename == "test.bin"
            # complete 应该在 2 秒内完成（主要是 S3 API 调用）
            assert elapsed < 2.0, f"complete took {elapsed:.2f}s, expected < 2s"

        # 验证文件已正确合并
        downloaded, _ = minio.download(self.test_sha256)
        assert downloaded == self.test_data

    @pytest.mark.asyncio
    async def test_complete_dedup_skips_compose(self):
        """已存在的 sha256 应跳过合并直接返回已有指纹"""
        # 先上传一次
        async with async_session() as db:
            fp1, _ = await chunked_upload.complete(db, self.upload_id, self.test_sha256)

        # 再创建一个 upload 会话，用同样的 sha256
        async with async_session() as db:
            upload2 = await chunked_upload.init(
                db, "test2.bin", len(self.test_data), 3
            )
            for i in range(3):
                start = i * self.chunk_size
                end = min(start + self.chunk_size, len(self.test_data))
                chunk_data = self.test_data[start:end]
                await chunked_upload.chunk(db, upload2.upload_id, i, chunk_data)
                self._cleanup_keys.append(f"chunks/{upload2.upload_id}/{i}")

            fp2, record2 = await chunked_upload.complete(db, upload2.upload_id, self.test_sha256)
            # 应返回同一个 fingerprint
            assert fp2.id == fp1.id
            assert record2.filename == "test2.bin"

    @pytest.mark.asyncio
    async def test_async_verification_detects_mismatch(self):
        """异步验证应检测 SHA256 不匹配（用错误 sha256 模拟）"""
        wrong_sha256 = "a" * 64

        async with async_session() as db:
            fp, _ = await chunked_upload.complete(db, self.upload_id, wrong_sha256)
            # 即使 SHA256 错误，complete 也应返回
            assert fp.sha256 == wrong_sha256

        # 等异步验证完成
        await asyncio.sleep(2)

        async with async_session() as db:
            fp_after = (await db.execute(
                select(Fingerprint).where(Fingerprint.sha256 == wrong_sha256)
            )).scalar_one_or_none()
            # 验证：verified 应为 False
            assert fp_after is not None
            assert fp_after.verified is False
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && python -m pytest tests/test_chunked_compose.py::TestChunkedUploadFastComplete -v
```
Expected: FAIL — `TypeError: ChunkedUpload.complete() missing 1 required positional argument: 'sha256'`

- [ ] **Step 3: 重写 complete() 方法**

```python
async def complete(self, db: AsyncSession, upload_id: str, sha256: str):
    upload = (await db.execute(
        select(Upload).where(Upload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise ValueError("上传会话不存在或已过期")

    chunks = sorted(upload.uploaded_chunks or [])
    if len(chunks) != upload.total_chunks:
        raise ValueError(f"分片未完整: {len(chunks)}/{upload.total_chunks}")

    from app.infrastructure.storage.entity.Fingerprint import Fingerprint

    # 去重：sha256 已存在则跳过合并
    existing = (await db.execute(
        select(Fingerprint).where(Fingerprint.sha256 == sha256)
    )).scalar_one_or_none()

    if existing:
        fp = existing
    else:
        # 服务端合并（数据不经过后端）
        mp_id = minio.create_multipart_upload(sha256)
        parts = []
        for i, n in enumerate(chunks, start=1):
            result = minio.upload_part_copy(
                sha256, mp_id, i, f"chunks/{upload_id}/{n}"
            )
            parts.append(result)
        minio.complete_multipart_upload(sha256, mp_id, parts)

        fp = Fingerprint(sha256=sha256, size=upload.total_size)
        db.add(fp)
        await db.flush()

    # 创建文件记录
    record = await storage_service.create_record(
        db, fp,
        filename=upload.filename,
        uploaded_by=upload.uploaded_by,
    )

    # 批量删除分片
    chunk_keys = [f"chunks/{upload_id}/{n}" for n in chunks]
    minio.delete_objects(chunk_keys)

    await db.delete(upload)
    await db.commit()

    # 异步验证 SHA256（后台任务，不阻塞返回）
    import asyncio
    asyncio.create_task(self._verify_sha256(sha256))

    return fp, record

async def _verify_sha256(self, sha256: str):
    """后台异步：下载文件验证 SHA256 是否匹配"""
    import asyncio
    import hashlib
    import logging
    _log = logging.getLogger("Elves.ChunkedUpload")

    from app.infrastructure.Database import async_session
    from app.infrastructure.storage.entity.Fingerprint import Fingerprint

    try:
        data, _ = minio.download(sha256)
        actual = hashlib.sha256(data).hexdigest()

        async with async_session() as db:
            fp = (await db.execute(
                select(Fingerprint).where(Fingerprint.sha256 == sha256)
            )).scalar_one_or_none()
            if fp:
                fp.verified = (actual == sha256)
                await db.commit()
                if not fp.verified:
                    _log.error(f"SHA256 验证失败: expected={sha256[:16]}..., actual={actual[:16]}...")
                else:
                    _log.info(f"SHA256 验证通过: {sha256[:16]}...")
    except Exception as e:
        _log.error(f"SHA256 异步验证异常: {e}")
```

- [ ] **Step 4: Fingerprint 模型添加 verified 字段**

在 `backend/app/infrastructure/storage/entity/Fingerprint.py` 中添加：

```python
verified: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
```

并生成迁移：
```sql
ALTER TABLE fingerprints ADD COLUMN verified TINYINT(1) NULL;
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd backend && python -m pytest tests/test_chunked_compose.py -v
```
Expected: 5 PASSED

- [ ] **Step 6: Commit**

```bash
git add backend/app/infrastructure/storage/ChunkedUpload.py \
        backend/app/infrastructure/storage/entity/Fingerprint.py \
        backend/tests/test_chunked_compose.py
git commit -m "feat: rewrite complete() with server-side compose + async SHA256 verification"
```

---

### Task 5: UploadRouter 接受 sha256 参数

**Files:**
- Create: `backend/app/infrastructure/storage/Schema/CompleteRequest.py`
- Modify: `backend/app/infrastructure/storage/UploadRouter.py`

- [ ] **Step 1: 创建 CompleteRequest schema**

```python
from pydantic import BaseModel


class CompleteRequest(BaseModel):
    sha256: str
```

- [ ] **Step 2: 更新 complete 端点**

将 `UploadRouter.py` 的 `complete_upload` 改为：

```python
from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest

@router.post("/{upload_id}/complete")
async def complete_upload(
    request: Request, upload_id: str, body: CompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:upload:complete")),
    _v=Depends(require_verified),
):
    try:
        fp, record = await chunked_upload.complete(db, upload_id, body.sha256)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"record_id": record.id})
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/infrastructure/storage/Schema/CompleteRequest.py \
        backend/app/infrastructure/storage/UploadRouter.py
git commit -m "feat: accept sha256 in complete upload request"
```

---

### Task 6: 前端 uploadFile() 传递 sha256

**Files:**
- Modify: `frontend/src/api/storage/index.ts`

- [ ] **Step 1: 更新 uploadApi.complete 和 uploadFile**

```typescript
// uploadApi.complete 改为接受 sha256
complete: (uploadId: string, sha256: string): Promise<{ record_id: number }> =>
  api.post<{ code: number; data: { record_id: number } }>(
    `/api/v1/uploads/${uploadId}/complete`,
    { sha256 }
  ).then((r) => r.data),
```

```typescript
// uploadFile 中调用 complete 时传入 sha256
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ record_id: number }> {
  const sha256 = await computeSHA256(file, (p) => onProgress?.(Math.round(p * 0.1)));
  const check = await uploadApi.check(sha256);
  if (check.exists && check.record_id) return { record_id: check.record_id };

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const session = await uploadApi.init(file.name, file.size, totalChunks);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    await uploadApi.uploadChunk(session.upload_id, i, blob);
    onProgress?.(10 + Math.round((i + 1) / totalChunks * 80));
  }

  // complete 现在毫秒返回，进度条直接跳到 100%
  onProgress?.(100);
  return uploadApi.complete(session.upload_id, sha256);
}
```

- [ ] **Step 2: 构建前端确认无编译错误**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/storage/index.ts
git commit -m "feat: pass SHA256 to upload complete for fast server-side compose"
```

---

### Task 7: 部署

- [ ] **Step 1: 运行数据库迁移**

```bash
ssh admin@192.168.3.21 "docker exec -i mysql mysql -u elsnow -p'T5N3uj+ImElFrfiF' el_snow_hub -e \"
  ALTER TABLE uploads ADD COLUMN chunk_hashes JSON NULL;
  ALTER TABLE fingerprints ADD COLUMN verified TINYINT(1) NULL;
\""
```

- [ ] **Step 2: 构建并部署前端**

```bash
cd frontend && npm run build
scp -r dist admin@192.168.3.21:/vol1/el-snow-elves-hub/frontend/
```

- [ ] **Step 3: 构建并部署后端**

```bash
scp backend/app/infrastructure/storage/MinioClient.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
scp backend/app/infrastructure/storage/ChunkedUpload.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
scp backend/app/infrastructure/storage/UploadRouter.py admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
scp -r backend/app/infrastructure/storage/entity admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
scp -r backend/app/infrastructure/storage/Schema admin@192.168.3.21:/vol1/el-snow-elves-hub/backend/app/infrastructure/storage/
ssh admin@192.168.3.21 "cd /vol1/el-snow-elves-hub && docker compose up -d --build backend && docker compose restart nginx"
```

- [ ] **Step 4: 验证上传功能**

上传一个版本文件，确认进度条流畅不卡，complete 快速返回。

- [ ] **Step 5: Commit + Push**

```bash
git commit -m "deploy: fast chunked upload with server-side compose"
git push
```
