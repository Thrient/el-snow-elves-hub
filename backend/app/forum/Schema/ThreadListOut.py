from pydantic import BaseModel

from app.forum.Schema.ThreadOut import ThreadOut


class ThreadListOut(BaseModel):
    items: list[ThreadOut]; total: int; page: int; pages: int
