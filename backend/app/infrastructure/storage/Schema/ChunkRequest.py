from pydantic import BaseModel


class ChunkResponse(BaseModel):
    chunk: int
    status: str  # "ok" | "exists" | "conflict"
