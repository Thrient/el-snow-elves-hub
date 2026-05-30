import { api } from "@/api/axios";
import type { NotificationItem } from "@/types";

export const notificationApi = {
  list: (page = 1) =>
    api.get<{ code: number; data: { items: NotificationItem[]; unread: number; total: number; page: number; pages: number } }>(
      "/api/v1/notifications", { params: { page } }
    ).then((r) => r.data),

  unreadCount: () =>
    api.get<{ code: number; data: { unread: number } }>("/api/v1/notifications/unread-count").then((r) => r.data.unread),

  markRead: (id: number) =>
    api.post(`/api/v1/notifications/${id}/read`),

  markAllRead: () =>
    api.post("/api/v1/notifications/read-all"),
};
