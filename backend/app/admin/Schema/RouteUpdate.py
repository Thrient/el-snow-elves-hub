from pydantic import BaseModel


class RouteUpdate(BaseModel):
    path: str | None = None
    title: str | None = None
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    enabled: bool | None = None
    in_menu: bool | None = None
    sort_order: int | None = None
    component: str | None = None
