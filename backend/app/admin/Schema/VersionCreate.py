from datetime import datetime
from pydantic import BaseModel


class FileEntry(BaseModel):
    path: str
    file_record_id: int


class VersionCreate(BaseModel):
    version: str
    platform: str = "Windows x64"
    changelog: str | None = None
    is_latest: bool = False
    is_mandatory: bool = False
    files: list[FileEntry]


class VersionItem(BaseModel):
    id: int
    version: str
    platform: str
    changelog: str | None = None
    is_latest: bool
    is_mandatory: bool
    created_at: datetime
    file_count: int | None = None

    model_config = {"from_attributes": True}
