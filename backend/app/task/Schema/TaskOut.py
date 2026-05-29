from datetime import datetime
from pydantic import BaseModel


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    author_id: int
    author_name: str = ""
    category: str
    tags: str | None
    version: str
    file_size: int | None
    cover_url: str | None
    status: str
    view_count: int
    download_count: int
    like_count: int
    comment_count: int
    liked: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
