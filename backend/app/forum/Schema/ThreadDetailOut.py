from datetime import datetime

from pydantic import BaseModel

from app.forum.Schema.PostAuthor import PostAuthor
from app.forum.Schema.ReplyOut import ReplyOut


class ThreadDetailOut(BaseModel):
    id: int; title: str | None; content: str; author: PostAuthor | None
    board_id: int; board_name: str; image_urls: list[str]
    is_pinned: bool; is_locked: bool; view_count: int; reply_count: int; like_count: int
    last_reply_at: str | None; created_at: datetime; updated_at: datetime
    replies: list[ReplyOut]
