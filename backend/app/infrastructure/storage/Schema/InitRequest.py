from pydantic import BaseModel


class InitRequest(BaseModel):
    filename: str
    total_size: int
    total_chunks: int
    sha256: str | None = None
