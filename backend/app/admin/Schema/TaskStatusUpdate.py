from pydantic import BaseModel


class TaskStatusUpdate(BaseModel):
    status: str
    reason: str | None = None
