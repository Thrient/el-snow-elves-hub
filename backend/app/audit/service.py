from contextvars import ContextVar

from app.audit.entity.AuditLog import AuditLog
from app.infrastructure.Database import async_session
from app.identity.entity.User import User

# 由 middleware 设置，log_audit 自动读取 — 调用方无需传 ip
_request_ip: ContextVar[str] = ContextVar("audit_request_ip", default="")


def set_request_ip(ip: str) -> None:
    _request_ip.set(ip)


async def log_audit(
    user: User | None,
    action: str,
    resource_type: str = "",
    resource_id: int | None = None,
    detail: str = "",
    ip: str = "",
) -> None:
    ip = ip or _request_ip.get()
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "匿名用户",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail[:2000],
        ip=ip[:45],
    )
    async with async_session() as db:
        db.add(log)
        await db.commit()
