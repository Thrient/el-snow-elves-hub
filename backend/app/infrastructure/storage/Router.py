"""文件存储 — 上传去重检测 + 文件获取（支持图片动态压缩）"""
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.Database import get_db
from app.api.Deps import get_current_user, require_perm_any
from app.infrastructure.Response import ok
from app.infrastructure.storage.MinioClient import client as minio
from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.FileValidator import detect_type, ALLOWED_IMAGE
from app.identity.entity.User import User

router = APIRouter(prefix="/files", tags=["文件"])

from app.infrastructure.storage.Schema.CheckRequest import CheckRequest


@router.post("/check")
async def check_file(
    body: CheckRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_perm_any("file:check")),
):
    hashes = body.get_list()
    if not hashes:
        return ok({"existing": [], "missing": []})
    rows = (await db.execute(
        select(Fingerprint.sha256, Fingerprint.id).where(Fingerprint.sha256.in_(hashes))
    )).all()
    fp_map = {row[0]: row[1] for row in rows}
    if isinstance(body.sha256, str):
        fp_id = fp_map.get(body.sha256)
        return ok({"exists": fp_id is not None, "fingerprint_id": fp_id})
    existing = [
        {"sha256": h, "fingerprint_id": fp_map[h]}
        for h in hashes if h in fp_map
    ]
    return ok({
        "existing": existing,
        "missing": [h for h in hashes if h not in fp_map],
    })


# ── 文件获取 ──

@router.get("/{sha256}")
async def get_blob(
    sha256: str,
    q: int | None = Query(None, ge=1, le=100, description="JPEG 质量"),
    w: int | None = Query(None, ge=1, le=4096, description="最大宽度"),
):
    """通过 SHA256 获取文件，图片可传 ?q= / ?w= 参数动态压缩"""
    try:
        data, content_type = minio.download(sha256)
    except Exception:
        raise HTTPException(404, "文件不存在")

    # 无参数 → 返回原文件
    if q is None and w is None:
        return Response(content=data, media_type=content_type,
                        headers={"Cache-Control": "public, max-age=31536000"})

    # 非图片不支持参数（用文件魔数判断，不依赖 MinIO ContentType）
    if detect_type(data) not in ALLOWED_IMAGE:
        raise HTTPException(400, "该文件不支持图片参数")

    img = Image.open(BytesIO(data))

    if w and img.width > w:
        ratio = w / img.width
        img = img.resize((w, int(img.height * ratio)), Image.LANCZOS)

    img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=q or 75, optimize=True)
    buf.seek(0)

    return Response(content=buf.getvalue(), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000"})
