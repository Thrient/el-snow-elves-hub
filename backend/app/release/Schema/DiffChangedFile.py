from pydantic import BaseModel


class DiffChangedFile(BaseModel):
    path: str
    sha256: str
    size: int
    fingerprint_id: int
