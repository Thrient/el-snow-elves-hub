import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface UserDownload {
  task_id: number;
  task_title: string;
  downloaded_at: string;
}

export interface UserLike {
  task_id: number;
  task_title: string;
  created_at: string;
}

export const usersApi = {
  getDownloads: () =>
    API.get<{ code: number; data: UserDownload[] }>("/users/me/downloads").then((r) => r.data.data),

  getLikes: () =>
    API.get<{ code: number; data: UserLike[] }>("/users/me/likes").then((r) => r.data.data),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return API.post<{ code: number; data: { avatar_url: string } }>("/users/me/avatar", fd);
  },
};
