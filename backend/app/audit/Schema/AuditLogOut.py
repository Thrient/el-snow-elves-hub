from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    username: str
    action: str
    resource_type: str
    resource_id: int | None
    detail: str
    ip: str
    created_at: datetime

    model_config = {"from_attributes": True}
