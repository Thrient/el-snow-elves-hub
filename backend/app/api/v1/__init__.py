"""API v1 路由聚合"""
import io
import zipfile
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.api.v1.auth import router as auth_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.files import router as files_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.forum import router as forum_router
from app.api.v1.blobs import router as blobs_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.client_stream import router as client_stream_router
from app.api.v1.admin_stream import router as admin_stream_router
from app.core.database import async_session, get_db
from app.core.deps import get_optional_user
from app.models.download import DownloadVersion
from app.models.fingerprint import Fingerprint
from app.models.version_file import VersionFile
from app.models.route import Route
from app.models.user import User
from app.schemas.route import RoutePublic
from app.utils.minio import stream_file

router = APIRouter()

router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(users_router)
router.include_router(files_router)
router.include_router(uploads_router)
router.include_router(forum_router)
router.include_router(blobs_router)
router.include_router(notifications_router)
router.include_router(client_stream_router)
router.include_router(admin_stream_router)


@router.get("/ping")
async def ping():
    return {"ping": "pong"}


@router.get("/versions")
async def list_public_versions(db=Depends(get_db)):
    """公开下载版本列表，无需登录"""
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


@router.post("/versions/diff", response_model=DiffResponse)
async def diff_versions(body: DiffRequest):
    """桌面端发送本地 manifest，返回差异文件列表"""
    async with async_session() as db:
        # Find latest version
        latest = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.is_latest == True)
        )).scalar_one_or_none()

        if not latest:
            return DiffResponse(latest_version=body.current_version)

        if latest.version == body.current_version:
            return DiffResponse(latest_version=body.current_version)

        # Get all files for latest version
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


@router.get("/versions/{version_id}/download")
async def download_version_zip(version_id: int):
    """下载版本为 zip 压缩包（流式，不落盘）。"""
    async with async_session() as db:
        # Look up version
        v = (await db.execute(
            select(DownloadVersion).where(DownloadVersion.id == version_id)
        )).scalar_one_or_none()
        if not v:
            raise HTTPException(404, "版本不存在")

        # Get all files
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


@router.get("/routes", response_model=list[RoutePublic])
async def get_routes(
    db=Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """获取当前用户可见的路由树（匿名用户只返回公开路由）"""
    result = await db.execute(
        select(Route).where(Route.enabled == True).order_by(Route.sort_order)
    )
    all_routes = result.scalars().all()

    # 按权限过滤
    user_perms: set[str] = set()
    if user:
        user_perms = set(user.permissions or [])

    visible: list[Route] = []
    for r in all_routes:
        if r.perm is None:
            visible.append(r)
        elif user_perms and ("*" in user_perms or r.perm in user_perms):
            visible.append(r)

    # 构建树结构
    route_map = {r.id: RoutePublic(
        id=r.id, path=r.path, title=r.title, icon=r.icon,
        parent_id=r.parent_id, perm=r.perm, in_menu=r.in_menu,
        component=r.component,
    ) for r in visible}

    roots: list[RoutePublic] = []
    for r in visible:
        node = route_map[r.id]
        if r.parent_id is not None and r.parent_id in route_map:
            route_map[r.parent_id].children.append(node)
        else:
            roots.append(node)

    return roots
