import re

from pydantic import BaseModel, field_validator

_NO_HTML = re.compile(r"[<>]")


class ThreadUpdate(BaseModel):
    title: str | None = None; content: str | None = None

    @classmethod
    @field_validator("title", "content")
    def no_html(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if _NO_HTML.search(v):
            raise ValueError("不能包含 HTML 标签")
        if len(v) > 20000:
            raise ValueError("内容过长")
        return v
