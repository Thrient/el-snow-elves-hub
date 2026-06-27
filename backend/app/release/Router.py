"""客户端版本管理 — 列表 / diff / 下载 ZIP / Blob 下载"""
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import async_session, get_db
from app.api.Deps import require_perm_any
from app.infrastructure.Response import ok
from app.release.entity.DownloadVersion import DownloadVersion
from app.release.entity.VersionFile import VersionFile
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileMeta import FileMeta
from app.infrastructure.storage.MinioClient import client as minio
from app.infrastructure.storage.StreamingZip import build_zip
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
            .join(FileMeta, VersionFile.file_meta_id == FileMeta.id)
            .join(Fingerprint, FileMeta.fingerprint_id == Fingerprint.id)
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
                    meta_id=vf.file_meta_id,
                ))

        removed = []
        for local_path in manifest_paths:
            if not any(vf.relative_path == local_path for vf, _ in vf_rows):
                removed.append(DiffRemovedFile(path=local_path))

        return DiffResponse(
            latest_version=latest.version, changelog=latest.changelog,
            is_mandatory=latest.is_mandatory, changed=changed, removed=removed,
        )


# @deprecated 下版本删除，用 /blobs/meta/{meta_id}
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


@router.get("/versions/blobs/meta/{meta_id}")
async def download_blob_by_meta(
    meta_id: int,
    _=Depends(require_perm_any("version:blob")),
):
    """通过元数据 ID 下载单个文件"""
    async with async_session() as db:
        meta = (await db.execute(
            select(FileMeta).where(FileMeta.id == meta_id)
        )).scalar_one_or_none()
        if not meta:
            raise HTTPException(404, "文件不存在")

        fp = meta.fingerprint
        gen, ct, length = minio.stream(fp.sha256)
        headers = {}
        if length:
            headers["Content-Length"] = str(length)
        download_name = meta.filename or "blob"
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
        await log_audit(None, "download", "file", meta_id, "", "")
        return StreamingResponse(gen, media_type=ct, headers=headers)


@router.get("/versions/{version_id}/download")
async def download_version_zip(
    version_id: int,
    _=Depends(require_perm_any("version:download")),
):
    """下载版本为 zip 压缩包（临时文件打包，流式传输后自动清理）"""
    async with async_session() as db:
        v = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.id == version_id)
        )).scalar_one_or_none()
        if not v:
            raise HTTPException(404, "版本不存在")

        rows = (await db.execute(
            select(VersionFile, Fingerprint)
            .join(FileMeta, VersionFile.file_meta_id == FileMeta.id)
            .join(Fingerprint, FileMeta.fingerprint_id == Fingerprint.id)
            .where(VersionFile.version_id == version_id)
        )).all()

        if not rows:
            raise HTTPException(404, "版本无文件")

        entries = [(vf.relative_path, fp.sha256) for vf, fp in rows]
        gen, content_length = build_zip(entries)

        await log_audit(None, "download", "version", version_id, "client v" + v.version, "")
        filename = quote(f"Elves-{v.version}.zip")
        return StreamingResponse(
            gen,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{filename}',
                "Content-Length": str(content_length),
            },
        )

