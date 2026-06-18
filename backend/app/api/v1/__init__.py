"""API v1 路由聚合"""
from fastapi import APIRouter

from app.identity.Router import router as identity_router
from app.task.Router import router as task_router
from app.forum.Router import router as forum_router
from app.release.Router import router as release_router
from app.notification.Router import router as notification_router
from app.admin.Router import router as admin_router
from app.infrastructure.storage.Router import router as files_router
from app.infrastructure.storage.UploadRouter import router as uploads_router
from app.infrastructure.navigation.Router import router as navigation_router
from app.ai.Router import router as ai_router

router = APIRouter()

router.include_router(identity_router)
router.include_router(task_router)
router.include_router(forum_router)
router.include_router(release_router)
router.include_router(notification_router)
router.include_router(admin_router)
router.include_router(uploads_router)
router.include_router(files_router)
router.include_router(navigation_router)
router.include_router(ai_router)
