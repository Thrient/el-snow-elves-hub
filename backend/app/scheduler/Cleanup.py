"""定时任务 — 过期上传清理 + 孤儿指纹清理"""
from app.infrastructure.Database import async_session
from app.infrastructure.storage.ChunkedUpload import chunked_upload
from app.scheduler.FingerprintCleanup import reconcile_and_cleanup


async def daily_cleanup():
    """每日 00:00 — 清理超24小时的过期上传会话"""
    try:
        async with async_session() as db:
            count = await chunked_upload.cleanup_expired(db)
            if count:
                print(f"[定时清理] 清理了 {count} 个过期上传")
    except Exception as e:
        print(f"[定时清理] 失败: {e}")


async def daily_fingerprint_cleanup():
    """每日 03:00 — 清理7天内无引用的孤儿指纹"""
    try:
        async with async_session() as db:
            count = await reconcile_and_cleanup(db)
            if count:
                print(f"[指纹清理] 清理了 {count} 个孤儿指纹")
    except Exception as e:
        print(f"[指纹清理] 失败: {e}")
