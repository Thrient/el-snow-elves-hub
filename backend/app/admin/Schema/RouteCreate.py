from pydantic import BaseModel


class RouteCreate(BaseModel):
    path: str
    title: str
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    enabled: bool = True
    in_menu: bool = True
    sort_order: int = 0
    component: str | None = None
