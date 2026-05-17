"""API v1 路由聚合"""
from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.v1.auth import router as auth_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.files import router as files_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.forum import router as forum_router
from app.api.v1.notifications import router as notifications_router
from app.core.database import get_db
from app.models.download import DownloadVersion

router = APIRouter()

router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(users_router)
router.include_router(files_router)
router.include_router(uploads_router)
router.include_router(forum_router)
router.include_router(notifications_router)


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
                "file_url": v.file_url,
                "file_size": v.file_size,
                "is_latest": v.is_latest,
                "created_at": v.created_at.isoformat(),
            }
            for v in versions
        ],
    }
