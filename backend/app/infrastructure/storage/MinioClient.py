"""MinIO S3 客户端 — 对象存储适配层"""
from boto3 import session

from app.Config import settings


class MinioClient:
    """封装 MinIO S3 操作，读写删 + 预签名 URL + 流式下载"""

    def __init__(self):
        sess = session.Session()
        self._bucket = settings.minio_bucket
        self._client = sess.client(
            "s3",
            endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
        )
        # 首次连接自动创建 bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        """如果 bucket 不存在则创建"""
        buckets = [b["Name"] for b in self._client.list_buckets().get("Buckets", [])]
        if self._bucket not in buckets:
            self._client.create_bucket(Bucket=self._bucket)

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream"):
        """上传对象"""
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    def get_url(self, key: str) -> str:
        """生成预签名下载链接，缓存 7 天"""
        from app.infrastructure.Redis import get_redis
        r = get_redis()
        cache_key = f"minio:url:{self._bucket}:{key}"
        cached = r.get(cache_key)
        if cached:
            return cached if isinstance(cached, str) else cached.decode()

        url = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=604800,  # 7 days
        )
        if settings.minio_public_endpoint:
            internal = f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}"
            url = url.replace(internal, settings.minio_public_endpoint)

        r.setex(cache_key, 604800, url)
        return url

    def download(self, key: str) -> tuple[bytes, str]:
        """下载对象，返回 (内容, ContentType)"""
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read(), resp.get("ContentType", "application/octet-stream")

    def delete(self, key: str):
        """删除对象"""
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def create_multipart_upload(self, key: str, content_type: str = "application/octet-stream") -> str:
        """创建分片合并上传，返回 UploadId"""
        resp = self._client.create_multipart_upload(
            Bucket=self._bucket, Key=key, ContentType=content_type,
        )
        return resp["UploadId"]

    def upload_part_copy(self, key: str, upload_id: str, part_number: int, source_key: str) -> dict:
        """从已有对象复制一个分片（服务端操作，零数据传输）"""
        resp = self._client.upload_part_copy(
            Bucket=self._bucket, Key=key, UploadId=upload_id,
            PartNumber=part_number,
            CopySource={"Bucket": self._bucket, "Key": source_key},
        )
        return {"PartNumber": part_number, "ETag": resp["CopyPartResult"]["ETag"]}

    def complete_multipart_upload(self, key: str, upload_id: str, parts: list[dict]):
        """完成分片合并"""
        self._client.complete_multipart_upload(
            Bucket=self._bucket, Key=key, UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )

    def delete_objects(self, keys: list[str]):
        """批量删除对象（自动分片每 1000 个一批）"""
        if not keys:
            return
        for i in range(0, len(keys), 1000):
            batch = keys[i:i + 1000]
            self._client.delete_objects(
                Bucket=self._bucket,
                Delete={"Objects": [{"Key": k} for k in batch]},
            )

    def stream(self, key: str):
        """流式下载，返回 (generator, ContentType, ContentLength)
        用于大文件分块传输，避免一次性加载到内存
        """
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        body = resp["Body"]
        ct = resp.get("ContentType", "application/octet-stream")
        length = resp.get("ContentLength")

        def generator():
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                yield chunk

        return generator(), ct, length


# 全局单例，所有调用方共享同一个连接
client = MinioClient()
