import re

from pydantic import BaseModel, field_validator


class UserUpdate(BaseModel):
    username: str | None = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("用户名不能为空")
        if re.search(r'[<>"\'&/]', v):
            raise ValueError("用户名不能包含特殊字符")
        return v
