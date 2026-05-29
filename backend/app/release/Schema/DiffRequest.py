from pydantic import BaseModel


class DiffRequest(BaseModel):
    current_version: str
    manifest: dict[str, str]
