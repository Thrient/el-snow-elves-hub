from pydantic import BaseModel


class PermUpdate(BaseModel):
    permission_ids: list[int]


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    data_scope: str = "self"


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data_scope: str | None = None


class PermCreate(BaseModel):
    code: str
    name: str
