"""文件 API — 预检 / 上传 / 下载（基于 SHA256 指纹）"""
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FileParam
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.database import get_db, async_session
from app.core.deps import get_current_user, get_optional_user
from app.models.fingerprint import Fingerprint
from app.models.user import User
from app.models.rbac import Role as RoleModel
from app.utils.fingerprint_service import store, file_url
from app.utils.minio import stream_file

router = APIRouter(prefix="/files", tags=["文件"])


class CheckRequest(BaseModel):
    sha256: str
    filename: str = ""
    size: int | None = None


@router.post("/check")
async def check_file(body: CheckRequest):
    async with async_session() as db:
        existing = (await db.execute(
            select(Fingerprint).where(Fingerprint.sha256 == body.sha256)
        )).scalar_one_or_none()
        if existing:
            return {"code": 0, "data": {"exists": True, "fingerprint_id": existing.id}}
        return {"code": 0, "data": {"exists": False, "fingerprint_id": None}}


@router.post("/upload")
async def upload_file(
    file: UploadFile = FileParam(...),
    user: User = Depends(get_current_user),
):
    """上传文件到 MinIO（SHA256 去重），返回 fingerprint_id / url / size"""
    if file.content_type and file.content_type.startswith("image/"):
        max_size = 10 * 1024 * 1024
    else:
        max_size = 200 * 1024 * 1024
    if file.size and file.size > max_size:
        raise HTTPException(400, f"文件不能超过 {max_size // 1024 // 1024}MB")

    data = await file.read()
    async with async_session() as db:
        fp = await store(db, data, file.filename or "file.bin",
                         file.content_type or "application/octet-stream")
        await db.commit()
        return {"code": 0, "data": {"fingerprint_id": fp.id, "url": file_url(fp), "size": fp.size}}


async def _check_download_perm(user: User | None, db) -> None:
    """检查下载权限：登录用户用自己的角色，匿名用户查 anonymous 角色"""
    if user:
        if not user.has_permission("version:download"):
            raise HTTPException(403, "需要下载权限，请联系管理员分配")
    else:
        result = await db.execute(
            select(RoleModel).where(RoleModel.name == "anonymous")
        )
        anon_role = result.scalar_one_or_none()
        if not anon_role or not anon_role.permissions:
            raise HTTPException(403, "请先登录后下载")
        perms = {p.code for p in anon_role.permissions}
        if "version:download" not in perms and "*" not in perms:
            raise HTTPException(403, "暂未开放匿名下载，请登录后下载")


@router.get("/{fingerprint_id}/download")
async def download_file(
    fingerprint_id: int,
    user: User | None = Depends(get_optional_user),
):
    """通过指纹 ID 流式下载文件（代理 MinIO），支持浏览器进度条"""
    async with async_session() as db:
        await _check_download_perm(user, db)
        fp = (await db.execute(
            select(Fingerprint).where(Fingerprint.id == fingerprint_id)
        )).scalar_one_or_none()
        if not fp:
            raise HTTPException(404, "文件不存在")
        gen, ct, length = stream_file(fp.sha256)
        encoded = quote(str(fingerprint_id))
        headers = {"Content-Disposition": f"attachment; filename=\"{encoded}\"; filename*=UTF-8''{encoded}"}
        if length:
            headers["Content-Length"] = str(length)
        return StreamingResponse(gen, media_type=ct, headers=headers)
