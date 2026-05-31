from datetime import datetime

from pydantic import BaseModel

from app.forum.Schema.PostAuthor import PostAuthor


class ReplyOut(BaseModel):
    id: int; content: str; author: PostAuthor | None
    parent_id: int | None; parent_author: str | None; parent_content: str | None
    image_urls: list[str]; like_count: int; liked: bool = False
    created_at: datetime; updated_at: datetime | None
