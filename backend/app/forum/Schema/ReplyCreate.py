import re

from pydantic import BaseModel, field_validator

_NO_HTML = re.compile(r"[<>]")


class ImageFingerprint(BaseModel):
    fingerprint_id: int
    filename: str


class ReplyCreate(BaseModel):
    content: str; parent_id: int | None = None; image_fingerprints: list[ImageFingerprint] | None = None

    @classmethod
    @field_validator("content")
    def no_html(cls, v: str) -> str:
        if _NO_HTML.search(v):
            raise ValueError("不能包含 HTML 标签")
        if len(v) > 20000:
            raise ValueError("内容过长")
        return v
