from pydantic import BaseModel


class BlobCheckRequest(BaseModel):
    sha256_list: list[str]


class BlobCheckResponse(BaseModel):
    existing: list[str]
    missing: list[str]
