from pydantic import BaseModel


class DiffChangedFile(BaseModel):
    path: str
    sha256: str
    size: int
    fingerprint_id: int  # @deprecated 下版本删除，用 meta_id
    meta_id: int | None = None
