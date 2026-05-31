"""邮件发送 — Resend"""
import httpx
from app.Config import settings

_resend = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, body: str):
    if not settings.resend_api_key:
        return
    async with httpx.AsyncClient(timeout=10) as cli:
        await cli.post(
            _resend,
            json={"from": settings.mail_from, "to": to, "subject": subject, "text": body},
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        )
