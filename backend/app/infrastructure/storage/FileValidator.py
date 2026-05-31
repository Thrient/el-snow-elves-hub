"""文件上传校验 — 大小 + 魔数 + 类型检测"""
from fastapi import HTTPException, UploadFile, status

from app.Config import settings

_MAGIC = {
    b"\x50\x4b\x03\x04": "zip",
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpeg",
    b"GIF8": "gif",
}

ALLOWED_IMAGE = {"png", "jpeg", "gif"}
ALLOWED_ZIP = {"zip"}


def detect_type(data: bytes) -> str | None:
    for magic, name in _MAGIC.items():
        if data.startswith(magic):
            return name
    return None


def validate_file_size(file: UploadFile) -> None:
    if file.size and file.size > settings.max_upload_size:
        limit_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"文件不能超过 {limit_mb}MB")


def validate_zip(data: bytes) -> None:
    if detect_type(data) not in ALLOWED_ZIP:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="仅支持 ZIP 文件")


def validate_image(data: bytes) -> None:
    if detect_type(data) not in ALLOWED_IMAGE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="仅支持图片格式（PNG / JPEG / GIF）")
