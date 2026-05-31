from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: int; username: str; email: str; avatar_url: str | None = None
    role_names: list[str] = []; permissions: list[str] | None = None
    email_verified: bool = False; created_at: datetime
    model_config = {"from_attributes": True}
