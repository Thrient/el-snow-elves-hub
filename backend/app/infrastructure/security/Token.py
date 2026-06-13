"""密码哈希 + 邮箱验证令牌"""

import bcrypt
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt

from app.Config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_verify_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "verify"},
        settings.jwt_secret, algorithm=settings.jwt_algorithm,
    )


def decode_verify_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "verify":
            return None
        return payload
    except JWTError:
        return None
