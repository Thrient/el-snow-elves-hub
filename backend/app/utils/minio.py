"""MinIO S3 客户端"""
import io
from boto3 import session

from app.config import settings

_s3 = None


def get_s3():
    global _s3
    if _s3 is None:
        sess = session.Session()
        _s3 = sess.client(
            "s3",
            endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
        )
        _ensure_bucket(_s3)
    return _s3


def _ensure_bucket(s3):
    buckets = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
    if settings.minio_bucket not in buckets:
        s3.create_bucket(Bucket=settings.minio_bucket)


def upload_file(key: str, data: bytes, content_type: str = "application/octet-stream"):
    s3 = get_s3()
    s3.put_object(Bucket=settings.minio_bucket, Key=key, Body=data, ContentType=content_type)


def get_file_url(key: str) -> str:
    s3 = get_s3()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": key},
        ExpiresIn=3600,
    )


def download_file(key: str) -> tuple[bytes, str]:
    s3 = get_s3()
    resp = s3.get_object(Bucket=settings.minio_bucket, Key=key)
    return resp["Body"].read(), resp.get("ContentType", "application/octet-stream")


def stream_file(key: str):
    """流式读取 MinIO 文件，返回 (generator, content_type, content_length)"""
    s3 = get_s3()
    resp = s3.get_object(Bucket=settings.minio_bucket, Key=key)
    body = resp["Body"]
    ct = resp.get("ContentType", "application/octet-stream")
    length = resp.get("ContentLength")
    def generator():
        for chunk in body.iter_chunks(chunk_size=1024 * 1024):
            yield chunk
    return generator(), ct, length
