from datetime import datetime
from pydantic import BaseModel


class CommentOut(BaseModel):
    id: int
    task_id: int
    user_id: int
    user_name: str = ""
    content: str
    parent_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
