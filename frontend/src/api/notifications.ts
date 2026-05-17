import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface NotificationItem {
  id: number;
  type: string;
  content: string;
  link: string | null;
  sender_name: string | null;
  is_read: boolean;
  created_at: string;
}

export const notificationApi = {
  list: (page = 1) =>
    API.get<{ code: number; data: { items: NotificationItem[]; unread: number; total: number; page: number; pages: number } }>(
      "/notifications", { params: { page } }
    ).then((r) => r.data.data),

  unreadCount: () =>
    API.get<{ code: number; data: { unread: number } }>("/notifications/unread-count").then((r) => r.data.data.unread),

  markRead: (id: number) =>
    API.post(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    API.post("/notifications/read-all").then((r) => r.data),
};
