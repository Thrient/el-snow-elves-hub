from datetime import datetime

from pydantic import BaseModel


class BoardOut(BaseModel):
    id: int; name: str; description: str | None; thread_count: int; created_at: datetime
    model_config = {"from_attributes": True}
