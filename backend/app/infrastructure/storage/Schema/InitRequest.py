from pydantic import BaseModel


class InitRequest(BaseModel):
    sha256: str
    total_chunks: int
    filename: str


class InitResponse(BaseModel):
    exists: bool
    chunks: list[int]
    total_chunks: int
