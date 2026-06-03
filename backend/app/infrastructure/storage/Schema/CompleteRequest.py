from pydantic import BaseModel


class CompleteRequest(BaseModel):
    sha256: str
    total_chunks: int


class CompleteResponse(BaseModel):
    fingerprint_id: int
