import pytest
from unittest.mock import AsyncMock, MagicMock, patch

CHUNK_DATA = b"x" * 100


def _mock_minio():
    """Return a mock MinioClient used by all tests."""
    m = MagicMock()
    m.upload = MagicMock()
    m.download = MagicMock()
    m.delete_objects = MagicMock()
    m.create_multipart_upload = MagicMock()
    m.upload_part_copy = MagicMock()
    m.complete_multipart_upload = MagicMock()
    return m


@pytest.mark.asyncio
async def test_init_returns_existing_chunks():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    cu = ChunkedUpload()
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.all.return_value = [(0,), (2,)]
    db.execute = AsyncMock(return_value=result_mock)

    status = await cu.init(db, sha256="abc", total_chunks=10, filename="test.zip")
    assert status == {"exists": True, "chunks": [0, 2], "total_chunks": 10}


@pytest.mark.asyncio
async def test_init_no_chunks():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    cu = ChunkedUpload()
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    status = await cu.init(db, sha256="abc", total_chunks=10, filename="test.zip")
    assert status == {"exists": False, "chunks": [], "total_chunks": 10}


@pytest.mark.asyncio
async def test_chunk_lock_acquired_writes_minio_and_db():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    cu = ChunkedUpload()
    db = AsyncMock()
    r = MagicMock()
    # double-check: chunk not in DB
    uc_check = MagicMock()
    uc_check.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=uc_check)

    mock_minio = _mock_minio()
    with patch("app.infrastructure.storage.ChunkedUpload.lock_chunk", return_value=True), \
         patch("app.infrastructure.storage.ChunkedUpload.release_chunk"), \
         patch("app.infrastructure.storage.ChunkedUpload._minio", return_value=mock_minio):
        result = await cu.chunk(db, r, sha256="abc", n=3, total_chunks=10,
                                filename="test.zip", data=CHUNK_DATA)
        assert result["status"] == "ok"
        assert result["chunk"] == 3
        mock_minio.upload.assert_called_once()


@pytest.mark.asyncio
async def test_chunk_lock_fails_returns_conflict():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    cu = ChunkedUpload()
    db = AsyncMock()
    r = MagicMock()
    # DB check returns None (no chunk) but lock still fails on second try
    check_result = MagicMock()
    check_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=check_result)

    with patch("app.infrastructure.storage.ChunkedUpload.lock_chunk", return_value=False):
        result = await cu.chunk(db, r, sha256="abc", n=3, total_chunks=10,
                                filename="test.zip", data=CHUNK_DATA)
        assert result["status"] in ("exists", "conflict")


@pytest.mark.asyncio
async def test_complete_returns_existing_fingerprint_fast_path():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    from app.infrastructure.storage.entity.Fingerprint import Fingerprint
    cu = ChunkedUpload()
    db = AsyncMock()
    r = MagicMock()

    # COUNT query
    count_mock = MagicMock()
    count_mock.scalar.return_value = 3
    # fingerprint exists
    fp = Fingerprint(sha256="finalhash", size=300, detected_type="text/plain")
    fp.id = 7
    fp_mock = MagicMock()
    fp_mock.scalar_one_or_none.return_value = fp

    db.execute = AsyncMock(side_effect=[count_mock, fp_mock])

    mock_minio = _mock_minio()
    # Return 3 chunks
    mock_minio.download = MagicMock(side_effect=[
        (b"a" * 100, "application/octet-stream"),
        (b"b" * 100, "application/octet-stream"),
        (b"c" * 100, "application/octet-stream"),
    ])

    with patch("app.infrastructure.storage.ChunkedUpload._minio", return_value=mock_minio):
        result = await cu.complete(db, r, sha256="abc", total_chunks=3)
        assert result["fingerprint_id"] == 7  # fast path, no merge


@pytest.mark.asyncio
async def test_direct_upload_new_file():
    from app.infrastructure.storage.ChunkedUpload import ChunkedUpload
    cu = ChunkedUpload()
    db = AsyncMock()
    r = MagicMock()

    check_mock = MagicMock()
    check_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=check_mock)

    mock_minio = _mock_minio()
    with patch("app.infrastructure.storage.ChunkedUpload.lock_merge", return_value=True), \
         patch("app.infrastructure.storage.ChunkedUpload.release_merge"), \
         patch("app.infrastructure.storage.ChunkedUpload._minio", return_value=mock_minio), \
         patch("app.infrastructure.storage.ChunkedUpload.detect_type", return_value="image/png"):
        result = await cu.direct_upload(db, r, filename="test.png", data=b"fakedata")
        assert "fingerprint_id" in result
        mock_minio.upload.assert_called_once()
