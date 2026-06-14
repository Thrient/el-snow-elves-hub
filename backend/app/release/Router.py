"""客户端版本管理 — 列表 / diff / 下载 ZIP / Blob 下载"""
import io
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import async_session, get_db
from app.api.Deps import require_perm_any
from app.infrastructure.Response import ok
from app.infrastructure.sse.OnlineTracker import connect as online_connect, disconnect as online_disconnect
from app.infrastructure.sse.SseConnection import SseConnection
from app.release.entity.DownloadVersion import DownloadVersion
from app.release.entity.VersionFile import VersionFile
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileRecord import FileRecord
from app.infrastructure.storage.MinioClient import client as minio
from app.audit.service import log_audit

router = APIRouter(tags=["版本管理"])

from app.release.Schema.DiffRequest import DiffRequest
from app.release.Schema.DiffChangedFile import DiffChangedFile
from app.release.Schema.DiffRemovedFile import DiffRemovedFile
from app.release.Schema.DiffResponse import DiffResponse


@router.get("/versions")
async def list_versions(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("version:list")),
):
    result = await db.execute(
        select(DownloadVersion, func.count(VersionFile.id).label("file_count"))
        .outerjoin(VersionFile, VersionFile.version_id == DownloadVersion.id)
        .group_by(DownloadVersion.id)
        .order_by(DownloadVersion.created_at.desc())
    )
    items = [
        {
            "id": v.id, "version": v.version, "platform": v.platform,
            "changelog": v.changelog, "is_latest": v.is_latest,
            "is_mandatory": v.is_mandatory, "file_count": file_count,
            "created_at": v.created_at.isoformat(),
        }
        for v, file_count in result.all()
    ]
    return ok(items)


@router.post("/versions/diff", response_model=DiffResponse)
async def diff_versions(
    body: DiffRequest,
    _=Depends(require_perm_any("version:diff")),
):
    """桌面端发送本地 manifest，返回差异文件列表"""
    async with async_session() as db:
        latest = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.is_latest == True)
        )).scalar_one_or_none()

        if not latest:
            return DiffResponse(latest_version=body.current_version)

        cur = body.current_version.lstrip("v")
        lat = latest.version.lstrip("v")
        if lat == cur:
            return DiffResponse(latest_version=body.current_version)

        vf_rows = (await db.execute(
            select(VersionFile, Fingerprint)
            .join(FileRecord, VersionFile.file_record_id == FileRecord.id)
            .join(Fingerprint, FileRecord.fingerprint_id == Fingerprint.id)
            .where(VersionFile.version_id == latest.id)
        )).all()

        changed = []
        manifest_paths = set(body.manifest.keys())

        for vf, fp in vf_rows:
            local_sha = body.manifest.get(vf.relative_path)
            if not local_sha or local_sha != fp.sha256:
                changed.append(DiffChangedFile(
                    path=vf.relative_path, sha256=fp.sha256,
                    size=fp.size, fingerprint_id=fp.id,
                    record_id=vf.file_record_id,
                ))

        removed = []
        for local_path in manifest_paths:
            if not any(vf.relative_path == local_path for vf, _ in vf_rows):
                removed.append(DiffRemovedFile(path=local_path))

        return DiffResponse(
            latest_version=latest.version, changelog=latest.changelog,
            is_mandatory=latest.is_mandatory, changed=changed, removed=removed,
        )


# @deprecated 下版本删除，用 /blobs/record/{record_id}
@router.get("/versions/blobs/{fingerprint_id}")
async def download_blob(
    fingerprint_id: int,
    _=Depends(require_perm_any("version:blob")),
):
    """通过指纹 ID 下载单个文件（桌面端更新用）"""
    async with async_session() as db:
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(404, "文件不存在")

        gen, ct, length = minio.stream(fp.sha256)
        headers = {}
        if length:
            headers["Content-Length"] = str(length)
        return StreamingResponse(gen, media_type=ct, headers=headers)


@router.get("/versions/blobs/record/{record_id}")
async def download_blob_by_record(
    record_id: int,
    _=Depends(require_perm_any("version:blob")),
):
    """通过记录 ID 下载单个文件"""
    async with async_session() as db:
        record = (await db.execute(
            select(FileRecord).where(FileRecord.id == record_id)
        )).scalar_one_or_none()
        if not record:
            raise HTTPException(404, "文件不存在")

        fp = record.fingerprint
        gen, ct, length = minio.stream(fp.sha256)
        headers = {}
        if length:
            headers["Content-Length"] = str(length)
        download_name = record.filename or "blob"
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
        await log_audit(None, "download", "file", record_id, "", "")
        return StreamingResponse(gen, media_type=ct, headers=headers)


@router.get("/versions/{version_id}/download")
async def download_version_zip(
    version_id: int,
    _=Depends(require_perm_any("version:download")),
):
    """下载版本为 zip 压缩包（流式，不落盘）"""
    async with async_session() as db:
        v = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.id == version_id)
        )).scalar_one_or_none()
        if not v:
            raise HTTPException(404, "版本不存在")

        rows = (await db.execute(
            select(VersionFile, Fingerprint)
            .join(FileRecord, VersionFile.file_record_id == FileRecord.id)
            .join(Fingerprint, FileRecord.fingerprint_id == Fingerprint.id)
            .where(VersionFile.version_id == version_id)
        )).all()

        if not rows:
            raise HTTPException(404, "版本无文件")

        content_length = 0
        for vf, fp in rows:
            name_bytes = vf.relative_path.encode("utf-8")
            content_length += fp.size + 30 + len(name_bytes) + 46 + len(name_bytes)
        content_length += 22

        def generate_zip():
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
                for vf, fp in rows:
                    gen, ct, length = minio.stream(fp.sha256)
                    content = b"".join(gen)
                    zf.writestr(vf.relative_path, content)
            buffer.seek(0)
            while True:
                chunk = buffer.read(8192)
                if not chunk:
                    break
                yield chunk

        await log_audit(None, "download", "version", version_id, "client v" + v.version, "")
        filename = quote(f"Elves-{v.version}.zip")
        return StreamingResponse(
            generate_zip(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{filename}',
                "Content-Length": str(content_length),
            },
        )

# ═══════════════════════════════════════════
# SSE 桌面客户端长连接
# ═══════════════════════════════════════════

@router.get("/client/stream",
            dependencies=[Depends(require_perm_any("client:stream"))])
async def client_stream():
    client_id, q = await online_connect("desktop")
    conn = SseConnection(q, on_disconnect=lambda: online_disconnect("desktop", client_id))
    return conn.stream()
