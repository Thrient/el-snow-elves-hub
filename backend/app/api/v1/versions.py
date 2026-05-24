"""版本管理 — 列表 / diff / 下载 ZIP / Blob 下载"""
import io
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import async_session, get_db
from app.core.deps import require_perm_any
from app.models.download import DownloadVersion
from app.models.fingerprint import Fingerprint
from app.models.version_file import VersionFile
from app.utils.minio import stream_file

router = APIRouter(prefix="/versions", tags=["版本管理"])


class DiffRequest(BaseModel):
    current_version: str
    manifest: dict[str, str]  # {relative_path: sha256}


class DiffChangedFile(BaseModel):
    path: str
    sha256: str
    size: int
    fingerprint_id: int


class DiffRemovedFile(BaseModel):
    path: str


class DiffResponse(BaseModel):
    latest_version: str
    changelog: str | None = None
    is_mandatory: bool = False
    changed: list[DiffChangedFile] = []
    removed: list[DiffRemovedFile] = []


@router.get("")
async def list_versions(db=Depends(get_db), _=Depends(require_perm_any("version:list"))):
    result = await db.execute(
        select(DownloadVersion).order_by(DownloadVersion.created_at.desc())
    )
    versions = result.scalars().all()
    return {
        "code": 0,
        "data": [
            {
                "id": v.id,
                "version": v.version,
                "platform": v.platform,
                "changelog": v.changelog,
                "is_latest": v.is_latest,
                "is_mandatory": v.is_mandatory,
                "created_at": v.created_at.isoformat(),
            }
            for v in versions
        ],
    }


@router.post("/diff", response_model=DiffResponse)
async def diff_versions(body: DiffRequest, _=Depends(require_perm_any("version:download"))):
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
            .join(Fingerprint, VersionFile.fingerprint_id == Fingerprint.id)
            .where(VersionFile.version_id == latest.id)
        )).all()

        changed = []
        manifest_paths = set(body.manifest.keys())

        for vf, fp in vf_rows:
            local_sha = body.manifest.get(vf.relative_path)
            if not local_sha or local_sha != fp.sha256:
                changed.append(DiffChangedFile(
                    path=vf.relative_path,
                    sha256=fp.sha256,
                    size=fp.size,
                    fingerprint_id=fp.id,
                ))

        removed = []
        for local_path in manifest_paths:
            if not any(vf.relative_path == local_path for vf, _ in vf_rows):
                removed.append(DiffRemovedFile(path=local_path))

        return DiffResponse(
            latest_version=latest.version,
            changelog=latest.changelog,
            is_mandatory=latest.is_mandatory,
            changed=changed,
            removed=removed,
        )


@router.get("/blobs/{fingerprint_id}")
async def download_blob(fingerprint_id: int, _=Depends(require_perm_any("version:download"))):
    """通过指纹 ID 下载单个文件（桌面端更新用）"""
    async with async_session() as db:
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(404, "文件不存在")

        gen, ct, length = stream_file(fp.sha256)
        headers = {}
        if length:
            headers["Content-Length"] = str(length)
        return StreamingResponse(gen, media_type=ct, headers=headers)


@router.get("/{version_id}/download")
async def download_version_zip(version_id: int, _=Depends(require_perm_any("version:download"))):
    """下载版本为 zip 压缩包（流式，不落盘）。"""
    async with async_session() as db:
        v = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.id == version_id)
        )).scalar_one_or_none()
        if not v:
            raise HTTPException(404, "版本不存在")

        rows = (await db.execute(
            select(VersionFile, Fingerprint)
            .join(Fingerprint, VersionFile.fingerprint_id == Fingerprint.id)
            .where(VersionFile.version_id == version_id)
        )).all()

        if not rows:
            raise HTTPException(404, "版本无文件")

        def generate_zip():
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                for vf, fp in rows:
                    gen, ct, length = stream_file(fp.sha256)
                    content = b''.join(gen)
                    zf.writestr(vf.relative_path, content)
            buffer.seek(0)
            while True:
                chunk = buffer.read(8192)
                if not chunk:
                    break
                yield chunk

        filename = quote(f"Elves-{v.version}.zip")
        return StreamingResponse(
            generate_zip(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{filename}',
            },
        )
