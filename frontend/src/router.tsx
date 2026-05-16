import { type FC } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { HomeOutlined, DownloadOutlined, AppstoreOutlined, SettingOutlined, DashboardOutlined, UserOutlined, CloudDownloadOutlined } from "@ant-design/icons";

import HomePage from "./pages/HomePage";
import DownloadPage from "./pages/DownloadPage";
import MarketPage from "./pages/MarketPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import RankingPage from "./pages/RankingPage";
import AuthorPage from "./pages/AuthorPage";
import UploadPage from "./pages/UploadPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import AdminLayout from "./pages/admin/AdminLayout";
import DashboardPage from "./pages/admin/DashboardPage";
import UsersPage from "./pages/admin/UsersPage";
import RolesPage from "./pages/admin/RolesPage";
import PermissionsPage from "./pages/admin/PermissionsPage";
import VersionsPage from "./pages/admin/VersionsPage";
import TasksPage from "./pages/admin/TasksPage";

// ── Route meta（用于导航菜单）──

export interface NavItem {
  path: string;
  title: string;
  icon?: FC;
  perm?: string;
  children?: NavItem[];
}

export const navItems: NavItem[] = [
  { path: "/", title: "首页", icon: HomeOutlined },
  { path: "/download", title: "下载", icon: DownloadOutlined },
  { path: "/market", title: "任务市场", icon: AppstoreOutlined },
  {
    path: "/admin",
    title: "管理",
    icon: SettingOutlined,
    perm: "admin.access",
    children: [
      { path: "/admin/dashboard", title: "仪表盘", perm: "dashboard.view", icon: DashboardOutlined },
      { path: "/admin/users", title: "用户管理", perm: "users.manage", icon: UserOutlined },
      { path: "/admin/roles", title: "角色管理", perm: "users.manage", icon: UserOutlined },
      { path: "/admin/permissions", title: "权限列表", perm: "users.manage", icon: UserOutlined },
      { path: "/admin/versions", title: "下载版本", perm: "versions.manage", icon: CloudDownloadOutlined },
      { path: "/admin/tasks", title: "任务管理", perm: "tasks.approve", icon: AppstoreOutlined },
    ],
  },
];

// ── React Router 路由对象 ──

export function buildRoutes(hasPerm: (code: string) => boolean): RouteObject[] {
  return [
    { path: "/", element: <HomePage /> },
    { path: "/download", element: <DownloadPage /> },
    { path: "/market", element: <MarketPage /> },
    { path: "/market/:id", element: <TaskDetailPage /> },
    { path: "/ranking", element: <RankingPage /> },
    { path: "/user/:id", element: <AuthorPage /> },
    { path: "/upload", element: <UploadPage /> },
    { path: "/profile", element: <ProfilePage /> },
    { path: "/login", element: <LoginPage /> },
    ...(hasPerm("admin.access")
      ? [{
          path: "/admin",
          element: <AdminLayout />,
          children: [
            { index: true, element: <Navigate to="/admin/dashboard" replace /> },
            ...(hasPerm("dashboard.view") ? [{ path: "dashboard", element: <DashboardPage /> }] : []),
            ...(hasPerm("users.manage") ? [{ path: "users", element: <UsersPage /> }] : []),
            ...(hasPerm("users.manage") ? [{ path: "roles", element: <RolesPage /> }] : []),
            ...(hasPerm("users.manage") ? [{ path: "permissions", element: <PermissionsPage /> }] : []),
            ...(hasPerm("versions.manage") ? [{ path: "versions", element: <VersionsPage /> }] : []),
            ...(hasPerm("tasks.approve") ? [{ path: "tasks", element: <TasksPage /> }] : []),
          ],
        } as RouteObject]
      : []),
    { path: "*", element: <div style={{ textAlign: "center", padding: 80, color: "#b8afa6" }}>404 · 页面不存在</div> },
  ];
}

// ── 导航菜单生成 ──

type MenuItem = { key: string; icon?: React.ReactNode; label: string; children?: MenuItem[] };

export function buildMenuItems(hasPerm: (code: string) => boolean): MenuItem[] {
  const walk = (items: NavItem[]): MenuItem[] =>
    items
      .filter((i) => !i.perm || hasPerm(i.perm))
      .map((i) => ({
        key: i.path,
        icon: i.icon ? <i.icon /> : undefined,
        label: i.title,
        children: i.children ? walk(i.children) : undefined,
      }));

  return walk(navItems);
}
