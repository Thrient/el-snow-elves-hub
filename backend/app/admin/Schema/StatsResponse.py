from pydantic import BaseModel


class StatsResponse(BaseModel):
    user_count: int
    version_count: int
    desktop_online: int
    web_online: int
