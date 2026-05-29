from datetime import datetime
from pydantic import BaseModel


class UserItem(BaseModel):
    id: int
    username: str
    email: str
    role_names: list = []
    role_ids: list = []
    permissions: list | None = None
    is_disabled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role_ids: list[int]
