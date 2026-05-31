from pydantic import BaseModel


class ReviewAction(BaseModel):
    status: str | None = None
    reviewed: bool | None = None
