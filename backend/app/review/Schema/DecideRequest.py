from pydantic import BaseModel


class DecideRequest(BaseModel):
    status: str
    reason: str | None = None
