from datetime import datetime

from pydantic import BaseModel


class LikeItem(BaseModel):
    task_id: int; task_title: str = ""; created_at: datetime
    model_config = {"from_attributes": True}
