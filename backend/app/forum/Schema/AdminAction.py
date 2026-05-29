from pydantic import BaseModel


class AdminAction(BaseModel):
    action: str
