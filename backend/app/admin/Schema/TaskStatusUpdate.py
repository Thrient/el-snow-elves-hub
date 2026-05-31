from pydantic import BaseModel


class TaskStatusUpdate(BaseModel):
    status: str
