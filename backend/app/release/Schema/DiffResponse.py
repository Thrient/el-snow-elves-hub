from pydantic import BaseModel

from app.release.Schema.DiffChangedFile import DiffChangedFile
from app.release.Schema.DiffRemovedFile import DiffRemovedFile


class DiffResponse(BaseModel):
    latest_version: str
    changelog: str | None = None
    is_mandatory: bool = False
    changed: list[DiffChangedFile] = []
    removed: list[DiffRemovedFile] = []
