import { api } from "@/api/axios";
import type { TaskItem, CommentItem, PageResult } from "@/types";

export const taskApi = {
  list: (params: { page?: number; size?: number; search?: string; category?: string; sort?: string } = {}) =>
    api.get<{ code: number; data: PageResult<TaskItem> }>("/api/v1/tasks", { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<{ code: number; data: TaskItem }>(`/api/v1/tasks/${id}`).then((r) => r.data),

  download: (id: number, version?: string) => `/api/v1/tasks/${id}/download${version ? `?version=${encodeURIComponent(version)}` : ""}`,

  batchDownload: (ids: number[]) =>
    api.post<Blob>("/api/v1/tasks/batch-download",
      { task_ids: ids },
      { responseType: "blob" },
    ),

  like: (id: number) =>
    api.post<{ code: number; data: { liked: boolean; like_count: number } }>(`/api/v1/tasks/${id}/like`).then((r) => r.data),

  comments: (id: number) =>
    api.get<{ code: number; data: CommentItem[] }>(`/api/v1/tasks/${id}/comments`).then((r) => r.data),

  addComment: (id: number, content: string, parent_id?: number) =>
    api.post(`/api/v1/tasks/${id}/comments`, { content, parent_id }),

  upload: (form: FormData) =>
    api.post("/api/v1/tasks", form),

  createWithFileId: (params: {
    title: string; description: string; category: string;
    tags: string; version: string; zip_fingerprint_id: number;
    filename?: string;
    cover_fingerprint_id?: number;
  }) => {
    const fd = new FormData();
    fd.append("title", params.title);
    fd.append("description", params.description);
    fd.append("category", params.category);
    fd.append("tags", params.tags);
    fd.append("version", params.version);
    fd.append("zip_fingerprint_id", String(params.zip_fingerprint_id));
    if (params.filename) fd.append("filename", params.filename);
    if (params.cover_fingerprint_id) fd.append("cover_fingerprint_id", String(params.cover_fingerprint_id));
    return api.post("/api/v1/tasks", fd);
  },

  ranking: (period: string = "all") =>
    api.get<{ code: number; data: TaskItem[] }>("/api/v1/tasks/rankings/list", { params: { period } }).then((r) => r.data),

  userTasks: (userId: number) =>
    api.get<{ code: number; data: TaskItem[] }>(`/api/v1/tasks/user/${userId}`).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/api/v1/tasks/${id}`),

  update: (id: number, params: Record<string, unknown> | FormData) =>
    api.put<{ code: number; data: unknown }>(`/api/v1/tasks/${id}`, params).then((r) => r.data),

  createVersion: (taskId: number, params: {
    version: string;
    zip_fingerprint_id: number;
    filename?: string;
    changelog?: string;
  }) => {
    const fd = new FormData();
    fd.append("version", params.version);
    fd.append("zip_fingerprint_id", String(params.zip_fingerprint_id));
    if (params.filename) fd.append("filename", params.filename);
    if (params.changelog) fd.append("changelog", params.changelog);
    return api.post<{ code: number; data: unknown }>(`/api/v1/tasks/${taskId}/versions`, fd).then((r) => r.data);
  },

  deleteVersion: (taskId: number, versionId: number) =>
    api.delete<{ code: number; data: unknown }>(`/api/v1/tasks/${taskId}/versions/${versionId}`).then((r) => r.data),

  replaceVersionFile: (taskId: number, versionId: number, params: {
    zip_fingerprint_id: number;
    filename?: string;
  }) => {
    const fd = new FormData();
    fd.append("zip_fingerprint_id", String(params.zip_fingerprint_id));
    if (params.filename) fd.append("filename", params.filename);
    return api.put<{ code: number; data: unknown }>(`/api/v1/tasks/${taskId}/versions/${versionId}`, fd).then((r) => r.data);
  },
};
