"""TDD: MinIO server-side chunk composition via S3 multipart copy (mocked)"""
import hashlib
import time

import moto
import pytest

# Start moto mock AWS BEFORE importing MinioClient so the module-level
# singleton connects to the local mock instead of a real MinIO instance.
_mock = moto.mock_aws()
_mock.start()

from app.infrastructure.storage.MinioClient import client as minio


class TestMinioMultipartCompose:
    @pytest.fixture(autouse=True)
    def _setup_and_teardown(self):
        """Upload 3 test chunks, yield, then clean up"""
        uid = hashlib.sha256(str(time.time()).encode()).hexdigest()[:8]
        self.chunk_prefix = f"test-chunks-{uid}"
        self.final_key = f"test-composed-{uid}"
        self.chunk_data = [b"A" * 5000000, b"B" * 5000000, b"C" * 12345]  # ~10MB total
        self.chunk_keys = []
        for i, data in enumerate(self.chunk_data):
            key = f"{self.chunk_prefix}/{i}"
            minio.upload(key, data)
            self.chunk_keys.append(key)
        yield
        # Teardown: clean up all test objects
        try:
            minio.delete_objects(self.chunk_keys + [self.final_key])
        except Exception:
            pass

    def test_multipart_compose_assembles_correctly(self):
        """服务端合并后下载验证内容等于原始拼接"""
        # Create multipart upload
        mp_id = minio.create_multipart_upload(self.final_key)

        # Copy each chunk as a part
        parts = []
        for i, key in enumerate(self.chunk_keys, start=1):
            result = minio.upload_part_copy(self.final_key, mp_id, i, key)
            parts.append(result)

        # Complete
        minio.complete_multipart_upload(self.final_key, mp_id, parts)

        # Verify: download and check content
        downloaded, _ = minio.download(self.final_key)
        expected = b"".join(self.chunk_data)
        assert downloaded == expected, f"Size mismatch: {len(downloaded)} vs {len(expected)}"

    def test_delete_objects_batch_removes_all(self):
        """批量删除应移除所有指定对象"""
        test_keys = [f"{self.chunk_prefix}/del-test-{i}" for i in range(3)]
        for key in test_keys:
            minio.upload(key, b"x" * 100)

        minio.delete_objects(test_keys)

        for key in test_keys:
            with pytest.raises(Exception):
                minio.download(key)
