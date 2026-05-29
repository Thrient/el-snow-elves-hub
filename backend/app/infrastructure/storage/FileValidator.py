"""文件上传校验 — 大小 + 魔数"""
from fastapi import HTTPException, UploadFile, status

from app.Config import settings

# 常见文件类型的魔数（前几个字节）
_MAGIC = {
    b"\x50\x4b\x03\x04": "zip",
    b"\x89PNG\r\n\x1a\n": "png",
    b"\xff\xd8\xff": "jpeg",
    b"GIF8": "gif",
    b"WEBP": "webp",
    b"RIFF": "webp",  # RIFF....WEBP
}


def validate_file_size(file: UploadFile) -> None:
    """检查文件大小不超过配置上限"""
    if file.size and file.size > settings.max_upload_size:
        limit_mb = settings.max_upload_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件不能超过 {limit_mb}MB",
        )


def _check_magic(data: bytes, expected: set[str]) -> str | None:
    """检查 data 的魔数是否匹配 expected 中的类型，返回匹配的类型名"""
    for magic, name in _MAGIC.items():
        if data.startswith(magic):
            # webp 特殊处理: RIFF 开头需要进一步检查
            if name == "webp" and len(data) >= 12:
                if data[8:12] == b"WEBP":
                    return "webp"
                continue
            return name
    return None


def validate_zip(data: bytes) -> None:
    """校验 ZIP 文件魔数"""
    if not data.startswith(b"\x50\x4b\x03\x04"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 ZIP 文件")


def validate_image(data: bytes) -> None:
    """校验图片文件魔数"""
    if not any(data.startswith(m) for m in _MAGIC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持图片格式（PNG/JPEG/GIF/WEBP）")
