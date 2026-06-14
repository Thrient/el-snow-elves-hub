from datetime import datetime
from pydantic import BaseModel


class TaskVersionOut(BaseModel):
    id: int
    version: str
    file_name: str | None = None
    file_size: int | None = None
    changelog: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    author_id: int
    author_name: str = ""
    author_avatar_url: str | None = None
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
    versions: list[TaskVersionOut] = []

    model_config = {"from_attributes": True}
