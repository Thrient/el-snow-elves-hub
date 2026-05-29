from pydantic import BaseModel


class ThreadCreate(BaseModel):
    title: str; content: str; board_id: int; image_ids: list[int] | None = None
