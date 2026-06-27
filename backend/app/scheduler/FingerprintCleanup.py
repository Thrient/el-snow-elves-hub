"""指纹孤儿清理 — 每日核算引用数，清理超过7天的孤儿指纹"""
from datetime import datetime, timedelta, timezone
from collections import Counter

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage.entity.Fingerprint import Fingerprint
from app.infrastructure.storage.entity.FileMeta import FileMeta
from app.infrastructure.storage.entity.OrphanTracker import OrphanTracker
from app.identity.entity.User import User
from app.task.entity.Task import Task as TaskModel
from app.task.entity.TaskVersion import TaskVersion
from app.release.entity.VersionFile import VersionFile
from app.forum.entity.ForumPost import ForumPost
from app.infrastructure.storage.MinioClient import client as minio


async def reconcile_and_cleanup(db: AsyncSession, retention_days: int = 7) -> int:
    """核算指纹引用计数，同步 orphan_tracker，清理过期孤儿。返回清理数量。"""

    # ── 1. 收集所有 FileRecord id（所有业务域都通过它引用文件） ──
    record_ids: set[int] = set()

    rows = (await db.execute(select(User.avatar_meta_id).where(User.avatar_meta_id.isnot(None)))).all()
    record_ids.update(r[0] for r in rows)

    rows = (await db.execute(select(TaskVersion.file_meta_id).where(TaskVersion.file_meta_id.isnot(None)))).all()
    record_ids.update(r[0] for r in rows)

    rows = (await db.execute(select(TaskModel.cover_meta_id).where(TaskModel.cover_meta_id.isnot(None)))).all()
    record_ids.update(r[0] for r in rows)

    rows = (await db.execute(select(VersionFile.file_meta_id))).all()
    record_ids.update(r[0] for r in rows)

    # forum_posts.image_ids — JSON 数组
    rows = (await db.execute(
        select(ForumPost.image_ids).where(
            ForumPost.image_ids.isnot(None),
            func.json_length(ForumPost.image_ids) > 0,
        )
    )).all()
    for (ids,) in rows:
        if ids:
            record_ids.update(ids)

    # ── 2. 从 FileRecord 算出 fingerprint 引用数 ──
    refs: Counter[int] = Counter()
    if record_ids:
        rows = (await db.execute(
            select(FileMeta.fingerprint_id).where(FileMeta.id.in_(record_ids))
        )).all()
        refs.update(r[0] for r in rows)

    # ── 3. 同步 orphan_tracker ──
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

    # ── 4. 清理超过 retention_days 的孤儿 ──
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

    for sha256 in expired_sha256s:
        try:
            minio.delete(sha256)
        except Exception:
            pass

    await db.execute(delete(OrphanTracker).where(OrphanTracker.fingerprint_id.in_(expired_ids)))
    await db.execute(delete(Fingerprint).where(Fingerprint.id.in_(expired_ids)))

    await db.commit()
    return len(expired_ids)
