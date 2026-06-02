import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_lock_chunk_acquire_and_release():
    """Redis chunk lock: acquire -> work -> release"""
    from app.infrastructure.storage.Lock import lock_chunk, release_chunk
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=True)
    mock_redis.delete = AsyncMock()

    acquired = await lock_chunk(mock_redis, "abc123", 3)
    assert acquired is True
    mock_redis.set.assert_called_once_with("upload:chunk:abc123:3", "1", nx=True, ex=30)

    await release_chunk(mock_redis, "abc123", 3)
    mock_redis.delete.assert_called_with("upload:chunk:abc123:3")


@pytest.mark.asyncio
async def test_lock_chunk_contention():
    """Redis chunk lock: returns False when already held"""
    from app.infrastructure.storage.Lock import lock_chunk
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=False)

    acquired = await lock_chunk(mock_redis, "abc123", 3)
    assert acquired is False


@pytest.mark.asyncio
async def test_lock_merge_acquire_and_release():
    """Redis merge lock: acquire -> work -> release"""
    from app.infrastructure.storage.Lock import lock_merge, release_merge
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=True)
    mock_redis.delete = AsyncMock()

    acquired = await lock_merge(mock_redis, "abc123")
    assert acquired is True
    mock_redis.set.assert_called_once_with("upload:merge:abc123", "1", nx=True, ex=300)

    await release_merge(mock_redis, "abc123")
    mock_redis.delete.assert_called_with("upload:merge:abc123")


@pytest.mark.asyncio
async def test_lock_merge_contention():
    """Redis merge lock: returns False when already held"""
    from app.infrastructure.storage.Lock import lock_merge
    mock_redis = MagicMock()
    mock_redis.set = AsyncMock(return_value=False)

    acquired = await lock_merge(mock_redis, "abc123")
    assert acquired is False


def test_upload_chunk_entity_creation():
    """UploadChunk entity creates with composite PK"""
    from app.infrastructure.storage.entity.UploadChunk import UploadChunk
    chunk = UploadChunk(
        sha256="abc123def456",
        chunk_index=3,
        total_chunks=10,
        filename="test.zip",
    )
    assert chunk.sha256 == "abc123def456"
    assert chunk.chunk_index == 3
    assert chunk.total_chunks == 10
    assert chunk.filename == "test.zip"
