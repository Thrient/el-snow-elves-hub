"""流式 ZIP 打包 — 从 MinIO 读取多个文件打包为临时 ZIP 后流式传输"""

import os
import tempfile
import zipfile
from collections.abc import Generator

from app.infrastructure.storage.MinioClient import client as minio


def build_zip(entries: list[tuple[str, str]]) -> tuple[Generator[bytes, None, None], int]:
    """将多个 MinIO 文件打包为 ZIP，返回 (chunk_generator, content_length)。

    entries: [(zip_path, sha256), ...]
        zip_path  — ZIP 包内的文件路径
        sha256    — MinIO 对象 key

    ZIP 写入临时文件后流式读取 8KB 分块，传输完成后自动清理临时文件。
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
            for path, sha256 in entries:
                gen, _, _ = minio.stream(sha256)
                zf.writestr(path, b"".join(gen))
        tmp.flush()
        content_length = os.path.getsize(tmp.name)
        tmp.seek(0)
    except Exception:
        tmp.close()
        os.unlink(tmp.name)
        raise

    def generate() -> Generator[bytes, None, None]:
        try:
            while True:
                chunk = tmp.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            tmp.close()
            os.unlink(tmp.name)

    return generate(), content_length
