"""Redis distributed locks for upload concurrency."""

CHUNK_TTL = 30     # chunk lock: 30s (writing 5MB to MinIO)
MERGE_TTL = 300    # merge lock: 5min (worst case: 1000 chunks x multipart copy)


async def lock_chunk(r, sha256: str, n: int) -> bool:
    """Try to acquire chunk lock. Returns True if acquired."""
    key = f"upload:chunk:{sha256}:{n}"
    return await r.set(key, "1", nx=True, ex=CHUNK_TTL)


async def release_chunk(r, sha256: str, n: int):
    """Release chunk lock."""
    key = f"upload:chunk:{sha256}:{n}"
    await r.delete(key)


async def lock_merge(r, sha256: str, *, ttl: int = MERGE_TTL) -> bool:
    """Try to acquire merge lock. Returns True if acquired."""
    key = f"upload:merge:{sha256}"
    return await r.set(key, "1", nx=True, ex=ttl)


async def release_merge(r, sha256: str):
    """Release merge lock."""
    key = f"upload:merge:{sha256}"
    await r.delete(key)
