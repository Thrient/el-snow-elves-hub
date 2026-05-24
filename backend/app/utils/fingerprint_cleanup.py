"""指纹孤儿清理 — 每日核算引用数，清理超过7天的孤儿指纹"""
from datetime import datetime, timedelta, timezone
from collections import Counter

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fingerprint import Fingerprint
from app.models.orphan_tracker import OrphanTracker
from app.models.user import User
from app.models.task import Task
from app.models.version_file import VersionFile
from app.models.forum import ForumPost
from app.utils.minio import delete_file


async def reconcile_and_cleanup(db: AsyncSession, retention_days: int = 7) -> int:
    """核算指纹引用计数，同步 orphan_tracker，清理过期孤儿。返回清理数量。"""

    # ── 1. 收集所有被引用的 fingerprint_id ──
    refs: Counter[int] = Counter()

    # users.avatar_id
    rows = (await db.execute(select(User.avatar_id).where(User.avatar_id.isnot(None)))).all()
    refs.update(r[0] for r in rows)

    # tasks.fingerprint_id
    rows = (await db.execute(select(Task.fingerprint_id).where(Task.fingerprint_id.isnot(None)))).all()
    refs.update(r[0] for r in rows)

    # tasks.cover_fingerprint_id
    rows = (await db.execute(select(Task.cover_fingerprint_id).where(Task.cover_fingerprint_id.isnot(None)))).all()
    refs.update(r[0] for r in rows)

    # version_files.fingerprint_id
    rows = (await db.execute(select(VersionFile.fingerprint_id))).all()
    refs.update(r[0] for r in rows)

    # forum_posts.image_ids — JSON 数组，拉到 Python 里展开
    rows = (await db.execute(
        select(ForumPost.image_ids).where(
            ForumPost.image_ids.isnot(None),
            func.json_length(ForumPost.image_ids) > 0,
        )
    )).all()
    for (ids,) in rows:
        if ids:
            refs.update(ids)

    # ── 2. 同步 orphan_tracker ──
    all_fingerprints = (await db.execute(select(Fingerprint.id))).scalars().all()
    existing_orphans = set(
        (await db.execute(select(OrphanTracker.fingerprint_id))).scalars().all()
    )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    to_insert: list[OrphanTracker] = []
    to_delete_ids: list[int] = []

    for fp_id in all_fingerprints:
        if refs[fp_id] == 0:
            if fp_id not in existing_orphans:
                to_insert.append(OrphanTracker(fingerprint_id=fp_id, first_orphaned_at=now))
        else:
            if fp_id in existing_orphans:
                to_delete_ids.append(fp_id)

    if to_insert:
        db.add_all(to_insert)
    if to_delete_ids:
        await db.execute(
            delete(OrphanTracker).where(OrphanTracker.fingerprint_id.in_(to_delete_ids))
        )

    await db.flush()

    # ── 3. 清理超过 retention_days 的孤儿 ──
    expired = (await db.execute(
        select(OrphanTracker.fingerprint_id, Fingerprint.sha256)
        .join(Fingerprint, Fingerprint.id == OrphanTracker.fingerprint_id)
        .where(OrphanTracker.first_orphaned_at < cutoff)
    )).all()

    if not expired:
        await db.commit()
        return 0

    expired_ids = [row[0] for row in expired]
    expired_sha256s = [row[1] for row in expired]

    # 删 MinIO blob
    for sha256 in expired_sha256s:
        try:
            delete_file(sha256)
        except Exception:
            pass  # MinIO 删除失败不阻塞 DB 清理

    # 删 orphan_tracker
    await db.execute(
        delete(OrphanTracker).where(OrphanTracker.fingerprint_id.in_(expired_ids))
    )
    # 删 fingerprints（CASCADE 自动删 orphan_tracker，这里显式删确保一致）
    await db.execute(
        delete(Fingerprint).where(Fingerprint.id.in_(expired_ids))
    )

    await db.commit()
    return len(expired_ids)
