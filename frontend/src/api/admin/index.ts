import { api } from "@/api/axios";
import { uploadFile } from "@/api/storage";
import type { AdminStats, AdminUser, RoleItem, PermItem, AdminVersion, RouteAdmin } from "@/types";

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
  listVersions: () => api.get<{ code: number; data: AdminVersion[] }>("/api/v1/versions").then((r) => r.data),
  createVersion: (data: {
    version: string;
    platform?: string;
    changelog?: string;
    is_latest?: boolean;
    is_mandatory?: boolean;
    files: { path: string; fingerprint_id: number }[];
  }) => api.post("/api/v1/admin/versions", data),
  deleteVersion: (id: number) => api.delete(`/api/v1/admin/versions/${id}`),

  // Blob
  checkBlobs: (sha256_list: string[]) =>
    api.post<{ code: number; data: { existing: { sha256: string; fingerprint_id: number }[]; missing: string[] } }>("/api/v1/files/check", { sha256: sha256_list }).then((r) => r.data),

  uploadBlob: (file: File, onProgress?: (pct: number) => void) => uploadFile(file, onProgress),

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
