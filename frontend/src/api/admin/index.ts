import { api } from "@/api/axios";
import type { AdminStats, AdminUser, RoleItem, PermItem, AdminVersion, AdminTask, RouteAdmin } from "@/types";

export const adminApi = {
  // Dashboard
  getStats: () => api.get<AdminStats>("/api/v1/admin/stats"),

  // Users
  listUsers: () => api.get<AdminUser[]>("/api/v1/admin/users"),
  updateUserRoles: (userId: number, roleIds: number[]) =>
    api.put(`/api/v1/admin/users/${userId}/roles`, { role_ids: roleIds }),
  disableUser: (userId: number) =>
    api.put<{ is_disabled: boolean }>(`/api/v1/admin/users/${userId}/disable`),
  deleteUser: (userId: number) =>
    api.delete(`/api/v1/admin/users/${userId}`),

  // Roles
  listRoles: () => api.get<RoleItem[]>("/api/v1/admin/roles"),
  createRole: (data: { name: string; description?: string }) =>
    api.post("/api/v1/admin/roles", data),
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    api.put(`/api/v1/admin/roles/${roleId}/permissions`, { permission_ids: permissionIds }),
  deleteRole: (id: number) => api.delete(`/api/v1/admin/roles/${id}`),

  // Permissions
  listPermissions: () => api.get<PermItem[]>("/api/v1/admin/permissions"),
  createPermission: (data: { code: string; name: string }) =>
    api.post("/api/v1/admin/permissions", data),
  updatePermission: (id: number, data: { code: string; name: string }) =>
    api.put(`/api/v1/admin/permissions/${id}`, data),
  deletePermission: (id: number) => api.delete(`/api/v1/admin/permissions/${id}`),

  // Versions
  listVersions: () => api.get<AdminVersion[]>("/api/v1/admin/versions"),
  createVersion: (data: {
    version: string;
    platform?: string;
    changelog?: string;
    is_latest?: boolean;
    is_mandatory?: boolean;
    files: { path: string; sha256: string }[];
  }) => api.post("/api/v1/admin/versions", data),
  deleteVersion: (id: number) => api.delete(`/api/v1/admin/versions/${id}`),

  // Blob
  checkBlobs: (sha256_list: string[]): Promise<{ existing: string[]; missing: string[] }> =>
    api.post("/api/v1/admin/blobs/check", { sha256_list }),

  uploadBlob: (file: File, onProgress?: (pct: number) => void): Promise<{ fingerprint_id: number; sha256: string; size: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/api/v1/admin/blobs/upload", form, onProgress ? {
      onUploadProgress: (e: { loaded?: number; total?: number }) => {
        if (e.total) onProgress(Math.round((e.loaded || 0) / e.total * 100));
      },
    } : undefined);
  },

  // Tasks
  listTasks: () => api.get<AdminTask[]>("/api/v1/admin/tasks"),
  updateTaskStatus: (id: number, status: string) =>
    api.put(`/api/v1/admin/tasks/${id}/status`, { status }),
  deleteTask: (id: number) => api.delete(`/api/v1/admin/tasks/${id}`),

  // Routes
  listRoutes: () => api.get<RouteAdmin[]>("/api/v1/admin/routes"),
  createRoute: (data: Omit<RouteAdmin, "id" | "created_at" | "updated_at">) =>
    api.post("/api/v1/admin/routes", data),
  updateRoute: (id: number, data: Partial<RouteAdmin>) =>
    api.put(`/api/v1/admin/routes/${id}`, data),
  deleteRoute: (id: number) => api.delete(`/api/v1/admin/routes/${id}`),
  toggleRoute: (id: number, enabled: boolean) =>
    api.put(`/api/v1/admin/routes/${id}/toggle`, { enabled }),
};
