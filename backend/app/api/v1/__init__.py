"""API v1 路由聚合"""
from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.admin.router import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.files import router as files_router
from app.api.v1.uploads import router as uploads_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(users_router)
router.include_router(files_router)
router.include_router(uploads_router)


@router.get("/ping")
async def ping():
    return {"ping": "pong"}
