import re

from pydantic import BaseModel, EmailStr, field_validator


class UserRegister(BaseModel):
    username: str; email: EmailStr; password: str

    @classmethod
    @field_validator("password")
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密码至少 8 位")
        if not re.search(r"[A-Za-z]", v) or not re.search(r"[0-9]", v):
            raise ValueError("密码需包含字母和数字")
        return v

    @classmethod
    @field_validator("username")
    def username_valid(cls, v: str) -> str:
        if len(v) < 2 or len(v) > 32:
            raise ValueError("用户名 2-32 个字符")
        return v
