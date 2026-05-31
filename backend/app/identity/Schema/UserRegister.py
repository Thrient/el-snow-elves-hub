import re

from pydantic import BaseModel, EmailStr, field_validator


class UserRegister(BaseModel):
    username: str; email: EmailStr; password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密码至少 8 位")
        kinds = bool(re.search(r"[a-z]", v)) + bool(re.search(r"[A-Z]", v)) + bool(re.search(r"\d", v))
        if kinds < 2:
            raise ValueError("需包含大小写字母、数字中至少两种")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if len(v) < 5 or len(v) > 12:
            raise ValueError("用户名 5-12 个字符")
        if re.search(r'[<>"\'&/]', v):
            raise ValueError("用户名不能包含特殊字符")
        return v
