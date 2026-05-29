"""前端路由 Schema"""
from pydantic import BaseModel


class RoutePublic(BaseModel):
    """公开接口返回的路由（不含管理字段）"""
    id: int
    path: str
    title: str
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    in_menu: bool = True
    component: str | None = None
    children: list["RoutePublic"] = []

    model_config = {"from_attributes": True}
