from pydantic import BaseModel


class ThreadUpdate(BaseModel):
    title: str | None = None; content: str | None = None
