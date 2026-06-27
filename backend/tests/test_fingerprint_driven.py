"""
Tests for fingerprint-driven architecture:
- /files/check returns fingerprint_id (not record_id)
- StorageService.create_meta creates FileMeta from fingerprint_id
"""
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def _mock_minio():
    """Mock MinioClient module so StorageService can be imported without MinIO."""
    original = sys.modules.pop("app.infrastructure.storage.MinioClient", None)
    mock_mod = MagicMock()
    mock_mod.client = MagicMock()
    sys.modules["app.infrastructure.storage.MinioClient"] = mock_mod
    yield
    # Restore original
    sys.modules.pop("app.infrastructure.storage.MinioClient", None)
    if original:
        sys.modules["app.infrastructure.storage.MinioClient"] = original


@pytest.mark.asyncio
async def test_check_returns_fingerprint_id_batch():
    """Batch check returns {existing: [{sha256, fingerprint_id}], missing: [...]}"""
    from app.infrastructure.storage.Router import check_file
    from app.infrastructure.storage.Schema.CheckRequest import CheckRequest

    db = AsyncMock()
    user = MagicMock()
    user.id = 1

    # Simulate 2 fingerprints found, 1 missing
    fp_rows = [("aaa111", 10), ("bbb222", 20)]
    fp_result = MagicMock()
    fp_result.all.return_value = fp_rows
    db.execute = AsyncMock(return_value=fp_result)

    body = CheckRequest(sha256=["aaa111", "bbb222", "ccc333"])
    result = await check_file(body, user=user, db=db)
    data = result["data"]

    assert data == {
        "existing": [
            {"sha256": "aaa111", "fingerprint_id": 10},
            {"sha256": "bbb222", "fingerprint_id": 20},
        ],
        "missing": ["ccc333"],
    }


@pytest.mark.asyncio
async def test_check_returns_fingerprint_id_single():
    """Single-hash check returns {exists, fingerprint_id} (no record_id)"""
    from app.infrastructure.storage.Router import check_file
    from app.infrastructure.storage.Schema.CheckRequest import CheckRequest

    db = AsyncMock()
    user = MagicMock()
    user.id = 1

    fp_rows = [("aaa111", 10)]
    fp_result = MagicMock()
    fp_result.all.return_value = fp_rows
    db.execute = AsyncMock(return_value=fp_result)

    body = CheckRequest(sha256="aaa111")
    result = await check_file(body, user=user, db=db)
    data = result["data"]

    assert data["exists"] is True
    assert data["fingerprint_id"] == 10
    assert "record_id" not in data


@pytest.mark.asyncio
async def test_check_single_not_found():
    """Single-hash check returns exists=False when sha256 not found"""
    from app.infrastructure.storage.Router import check_file
    from app.infrastructure.storage.Schema.CheckRequest import CheckRequest

    db = AsyncMock()
    user = MagicMock()
    user.id = 1

    fp_result = MagicMock()
    fp_result.all.return_value = []
    db.execute = AsyncMock(return_value=fp_result)

    body = CheckRequest(sha256="nonexistent")
    result = await check_file(body, user=user, db=db)
    data = result["data"]

    assert data["exists"] is False
    assert data["fingerprint_id"] is None


@pytest.mark.asyncio
async def test_create_meta(_mock_minio):
    """StorageService.create_meta creates FileMeta from fingerprint_id"""
    from unittest.mock import patch as local_patch
    from app.infrastructure.storage.StorageService import storage_service

    db = AsyncMock()
    fp = MagicMock()
    fp.id = 42
    fp.size = 1024

    fp_check = MagicMock()
    fp_check.scalar_one_or_none.return_value = fp
    db.execute = AsyncMock(return_value=fp_check)

    # Mock FileMeta to avoid SQLAlchemy mapper config issues in test
    mock_record = MagicMock()
    mock_record.fingerprint_id = 42
    mock_record.filename = "test.zip"
    mock_record.size = 1024
    with local_patch("app.infrastructure.storage.StorageService.FileMeta",
                     return_value=mock_record):
        record = await storage_service.create_meta(
            db, fingerprint_id=42, filename="test.zip",
        )

    assert record.fingerprint_id == 42
    assert record.filename == "test.zip"
    assert record.size == 1024
    db.add.assert_called_once()
    db.flush.assert_called()


@pytest.mark.asyncio
async def test_create_meta_not_found(_mock_minio):
    """Raises ValueError when fingerprint_id does not exist"""
    from app.infrastructure.storage.StorageService import storage_service

    db = AsyncMock()
    fp_check = MagicMock()
    fp_check.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=fp_check)

    with pytest.raises(ValueError, match="指纹不存在"):
        await storage_service.create_meta(
            db, fingerprint_id=999, filename="nope.zip",
        )
