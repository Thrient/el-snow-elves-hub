"""TDD: Upload SHA256 resume — init() session reuse, schema validation"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession


class TestInitRequest:
    """Task 2: InitRequest schema — optional sha256"""

    def test_init_request_without_sha256(self):
        """InitRequest without sha256 should work (backward compatible)"""
        from app.infrastructure.storage.Schema.InitRequest import InitRequest
        req = InitRequest(filename="test.txt", total_size=1024, total_chunks=3)
        assert req.filename == "test.txt"
        assert req.total_size == 1024
        assert req.total_chunks == 3
        assert req.sha256 is None

    def test_init_request_with_sha256(self):
        """InitRequest with sha256 should accept and store it"""
        from app.infrastructure.storage.Schema.InitRequest import InitRequest
        sha = "a" * 64
        req = InitRequest(filename="test.txt", total_size=1024, total_chunks=3, sha256=sha)
        assert req.sha256 == sha


class TestCompleteRequest:
    """Task 4: CompleteRequest schema — empty body, backend computes hash"""

    def test_complete_request_empty_body(self):
        """CompleteRequest() should be instantiable with no fields"""
        from app.infrastructure.storage.Schema.CompleteRequest import CompleteRequest
        req = CompleteRequest()
        assert req is not None


class TestChunkedUploadInit:
    """Task 3: ChunkedUpload.init() — SHA256 session reuse"""

    @pytest.fixture(autouse=True)
    def _patch_infrastructure(self):
        """Prevent Database/MinIO from creating real connections at import time."""
        import sys
        # Pre-populate fake MinioClient/StorageService so the real ones never import
        fake_minio = MagicMock()
        fake_minio.client = MagicMock()
        sys.modules["app.infrastructure.storage.MinioClient"] = fake_minio
        sys.modules["app.infrastructure.storage.StorageService"] = MagicMock()
        with patch("sqlalchemy.ext.asyncio.create_async_engine", return_value=MagicMock()):
            with patch("app.infrastructure.Database.async_session", MagicMock()):
                yield

    @pytest.fixture
    def mock_db(self):
        """Mock AsyncSession with execute/add/commit"""
        db = AsyncMock(spec=AsyncSession)
        db.commit = AsyncMock()
        db.add = MagicMock()
        return db

    @pytest.mark.asyncio
    async def test_init_without_sha256_creates_new(self, mock_db):
        """init() without sha256 creates a new Upload (no resume attempt)"""
        from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
        cu = ChunkedUpload()
        upload = await cu.init(mock_db, "file.bin", 2048, 5)
        assert upload.filename == "file.bin"
        assert upload.total_size == 2048
        assert upload.total_chunks == 5
        assert upload.sha256 is None
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_init_with_new_sha256_creates_new(self, mock_db):
        """init() with a sha256 not in DB creates a new Upload with sha256 set"""
        from app.infrastructure.storage.ChunkedUpload import ChunkedUpload

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        cu = ChunkedUpload()
        sha = "b" * 64
        upload = await cu.init(mock_db, "file.bin", 2048, 5, sha256=sha)
        assert upload.filename == "file.bin"
        assert upload.sha256 == sha
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_init_with_existing_sha256_resumes(self, mock_db):
        """init() with same sha256 returns existing uploading session (resume)"""
        from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
        from app.infrastructure.storage.entity.Upload import Upload

        existing = Upload(
            filename="already.bin", total_size=4096, total_chunks=10,
            sha256="c" * 64, status="uploading",
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing
        mock_db.execute = AsyncMock(return_value=mock_result)

        cu = ChunkedUpload()
        sha = "c" * 64
        upload = await cu.init(mock_db, "new_name.bin", 1024, 2, sha256=sha)
        assert upload is existing
        assert upload.filename == "already.bin"
        assert upload.sha256 == sha
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_init_with_sha256_ignores_completed_sessions(self, mock_db):
        """init() with sha256 only resumes 'uploading' sessions, not completed ones"""
        from app.infrastructure.storage.ChunkedUpload import ChunkedUpload

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        cu = ChunkedUpload()
        sha = "d" * 64
        upload = await cu.init(mock_db, "file.bin", 2048, 5, sha256=sha)
        assert upload.sha256 == sha
        mock_db.add.assert_called_once()
