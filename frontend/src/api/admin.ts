import axios from "axios";
import { tryRefreshToken } from "../store/auth";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

API.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      // Try refresh once, dedupe concurrent 401s
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        // Retry original request with new token
        err.config!.headers.Authorization = `Bearer ${newToken}`;
        return API(err.config!);
      }
      // Refresh failed — clear and redirect
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export interface AdminStats {
  user_count: number;
  version_count: number;
  desktop_online: number;
  web_online: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role_names: string[];
  role_ids: number[];
  permissions: string[] | null;
  created_at: string;
}

export interface PermItem {
  id: number;
  code: string;
  name: string;
}

export interface RoleItem {
  id: number;
  name: string;
  description: string;
  permissions: { code: string; name: string }[];
}

export interface AdminVersion {
  id: number;
  version: string;
  platform: string;
  changelog: string | null;
  file_url: string;
  file_size: number | null;
  is_latest: boolean;
  created_at: string;
}

export interface AdminTask {
  id: number;
  title: string;
  author_id: number;
  category: string;
  version: string;
  status: string;
  download_count: number;
  like_count: number;
  file_size: number | null;
  created_at: string;
}

export interface RouteAdmin {
  id: number;
  path: string;
  title: string;
  icon: string | null;
  parent_id: number | null;
  perm: string | null;
  enabled: boolean;
  in_menu: boolean;
  sort_order: number;
  component: string | null;
  created_at: string;
  updated_at: string;
}

export const adminApi = {
  // Dashboard
  getStats: () => API.get<AdminStats>("/admin/stats").then((r) => r.data),

  // Users
  listUsers: () => API.get<AdminUser[]>("/admin/users").then((r) => r.data),
  updateUserRoles: (userId: number, roleIds: number[]) =>
    API.put(`/admin/users/${userId}/roles`, { role_ids: roleIds }),

  // Roles
  listRoles: () => API.get<RoleItem[]>("/admin/roles").then((r) => r.data),
  createRole: (data: { name: string; description?: string }) =>
    API.post("/admin/roles", data).then((r) => r.data),
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    API.put(`/admin/roles/${roleId}/permissions`, { permission_ids: permissionIds }),
  deleteRole: (id: number) => API.delete(`/admin/roles/${id}`),

  // Permissions
  listPermissions: () => API.get<PermItem[]>("/admin/permissions").then((r) => r.data),
  createPermission: (data: { code: string; name: string }) =>
    API.post("/admin/permissions", data).then((r) => r.data),
  updatePermission: (id: number, data: { code: string; name: string }) =>
    API.put(`/admin/permissions/${id}`, data).then((r) => r.data),
  deletePermission: (id: number) => API.delete(`/admin/permissions/${id}`),

  // Versions
  listVersions: () => API.get<AdminVersion[]>("/admin/versions").then((r) => r.data),
  createVersion: (data: Omit<AdminVersion, "id" | "created_at">) =>
    API.post("/admin/versions", data).then((r) => r.data),
  uploadVersionFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return API.post("/files/upload", form).then((r) => r.data.data);
  },
  deleteVersion: (id: number) => API.delete(`/admin/versions/${id}`),

  // Tasks
  listTasks: () => API.get<AdminTask[]>("/admin/tasks").then((r) => r.data),
  updateTaskStatus: (id: number, status: string) =>
    API.put(`/admin/tasks/${id}/status`, { status }),
  deleteTask: (id: number) => API.delete(`/admin/tasks/${id}`),

  // Routes
  listRoutes: () => API.get<RouteAdmin[]>("/admin/routes").then((r) => r.data),
  createRoute: (data: Omit<RouteAdmin, "id" | "created_at" | "updated_at">) =>
    API.post("/admin/routes", data).then((r) => r.data),
  updateRoute: (id: number, data: Partial<RouteAdmin>) =>
    API.put(`/admin/routes/${id}`, data).then((r) => r.data),
  deleteRoute: (id: number) => API.delete(`/admin/routes/${id}`),
  toggleRoute: (id: number, enabled: boolean) =>
    API.put(`/admin/routes/${id}/toggle`, { enabled }),
};
