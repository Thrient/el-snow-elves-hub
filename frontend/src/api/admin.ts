import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export interface AdminStats {
  user_count: number;
  version_count: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role_name: string | null;
  role_id: number | null;
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

export const adminApi = {
  // Dashboard
  getStats: () => API.get<AdminStats>("/admin/stats").then((r) => r.data),

  // Users
  listUsers: () => API.get<AdminUser[]>("/admin/users").then((r) => r.data),
  updateUserRole: (userId: number, roleId: number) =>
    API.put(`/admin/users/${userId}/role`, { role_id: roleId }),

  // Roles
  listRoles: () => API.get<RoleItem[]>("/admin/roles").then((r) => r.data),
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    API.put(`/admin/roles/${roleId}/permissions`, { permission_ids: permissionIds }),

  // Permissions (read-only)
  listPermissions: () => API.get<PermItem[]>("/admin/permissions").then((r) => r.data),

  // Versions
  listVersions: () => API.get<AdminVersion[]>("/admin/versions").then((r) => r.data),
  createVersion: (data: Omit<AdminVersion, "id" | "created_at">) =>
    API.post("/admin/versions", data).then((r) => r.data),
  deleteVersion: (id: number) => API.delete(`/admin/versions/${id}`),

  // Tasks
  listTasks: () => API.get<AdminTask[]>("/admin/tasks").then((r) => r.data),
  approveTask: (id: number) => API.post(`/admin/tasks/${id}/approve`),
  rejectTask: (id: number) => API.post(`/admin/tasks/${id}/reject`),
  deleteTask: (id: number) => API.delete(`/admin/tasks/${id}`),
};
