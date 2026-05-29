from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str
    parent_id: int | None = None
