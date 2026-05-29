from pydantic import BaseModel


class ReplyCreate(BaseModel):
    content: str; parent_id: int | None = None; image_ids: list[int] | None = None
