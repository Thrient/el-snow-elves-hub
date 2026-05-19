"""路由 Schema — 公开接口和管理接口的请求/响应模型"""
from datetime import datetime
from pydantic import BaseModel


class RoutePublic(BaseModel):
    """公开接口返回的路由（不含管理字段）"""
    id: int
    path: str
    title: str
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    component: str | None = None
    children: list["RoutePublic"] = []

    model_config = {"from_attributes": True}


class RouteAdmin(BaseModel):
    """管理接口返回的路由（含全字段）"""
    id: int
    path: str
    title: str
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    enabled: bool = True
    sort_order: int = 0
    component: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RouteCreate(BaseModel):
    """创建路由"""
    path: str
    title: str
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    enabled: bool = True
    sort_order: int = 0
    component: str | None = None


class RouteUpdate(BaseModel):
    """更新路由（所有字段可选）"""
    path: str | None = None
    title: str | None = None
    icon: str | None = None
    parent_id: int | None = None
    perm: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None
    component: str | None = None


class RouteToggle(BaseModel):
    """启用/禁用路由"""
    enabled: bool
