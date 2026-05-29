from pydantic import BaseModel


class DiffRemovedFile(BaseModel):
    path: str
