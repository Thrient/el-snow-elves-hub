from pydantic import BaseModel


class PostAuthor(BaseModel):
    id: int; username: str; avatar_url: str | None
