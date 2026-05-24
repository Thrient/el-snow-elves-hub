import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface TaskItem {
  id: number;
  title: string;
  description: string | null;
  author_id: number;
  author_name: string;
  category: string;
  tags: string | null;
  version: string;
  file_size: number | null;
  cover_url: string | null;
  status: string;
  download_count: number;
  like_count: number;
  comment_count: number;
  liked: boolean;
  created_at: string;
}

export interface CommentItem {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  content: string;
  parent_id: number | null;
  created_at: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export const taskApi = {
  list: (params: { page?: number; size?: number; search?: string; category?: string; sort?: string } = {}) =>
    API.get<{ code: number; data: PageResult<TaskItem> }>("/tasks", { params }).then((r) => r.data.data),

  get: (id: number) =>
    API.get<{ code: number; data: TaskItem }>(`/tasks/${id}`).then((r) => r.data.data),

  download: (id: number) => `/api/v1/tasks/${id}/download`,

  like: (id: number) =>
    API.post<{ code: number; data: { liked: boolean; like_count: number } }>(`/tasks/${id}/like`).then((r) => r.data.data),

  comments: (id: number) =>
    API.get<{ code: number; data: CommentItem[] }>(`/tasks/${id}/comments`).then((r) => r.data.data),

  addComment: (id: number, content: string, parent_id?: number) =>
    API.post(`/tasks/${id}/comments`, { content, parent_id }).then((r) => r.data),

  upload: (form: FormData) =>
    API.post("/tasks", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),

  createWithFileId: (params: {
    title: string; description: string; category: string;
    tags: string; version: string; zip_file_id: number;
    filename?: string;
    cover?: File;
  }) => {
    const fd = new FormData();
    fd.append("title", params.title);
    fd.append("description", params.description);
    fd.append("category", params.category);
    fd.append("tags", params.tags);
    fd.append("version", params.version);
    fd.append("zip_file_id", String(params.zip_file_id));
    if (params.filename) fd.append("filename", params.filename);
    if (params.cover) fd.append("cover", params.cover);
    return API.post("/tasks", fd, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
  },

  ranking: (period: string = "all") =>
    API.get<{ code: number; data: TaskItem[] }>("/tasks/rankings/list", { params: { period } }).then((r) => r.data.data),

  userTasks: (userId: number) =>
    API.get<{ code: number; data: TaskItem[] }>(`/tasks/user/${userId}`).then((r) => r.data.data),

  delete: (id: number) =>
    API.delete(`/tasks/${id}`).then((r) => r.data),
};
