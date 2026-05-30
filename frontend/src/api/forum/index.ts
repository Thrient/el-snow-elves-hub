import { api } from "@/api/axios";
import type { ForumBoard, ThreadItem, ThreadDetail, PageResult } from "@/types";

export const forumApi = {
  listBoards: () =>
    api.get<{ code: number; data: ForumBoard[] }>("/api/v1/forum/boards").then((r) => r.data),

  listThreads: (boardId: number, page = 1) =>
    api.get<{ code: number; data: PageResult<ThreadItem> }>(`/api/v1/forum/boards/${boardId}/threads`, { params: { page } })
      .then((r) => r.data),

  getThread: (id: number) =>
    api.get<{ code: number; data: ThreadDetail }>(`/api/v1/forum/threads/${id}`).then((r) => r.data),

  createThread: (data: { title: string; content: string; board_id: number; image_ids?: number[] }) =>
    api.post("/api/v1/forum/threads", data),

  createReply: (threadId: number, content: string, parent_id?: number, image_ids?: number[]) =>
    api.post(`/api/v1/forum/threads/${threadId}/replies`, { content, parent_id, image_ids }),

  likePost: (postId: number) =>
    api.post<{ code: number; data: { liked: boolean; like_count: number } }>(`/api/v1/forum/posts/${postId}/like`),

  updateThread: (id: number, data: { title?: string; content?: string }) =>
    api.put(`/api/v1/forum/threads/${id}`, data),

  deleteThread: (id: number) =>
    api.delete(`/api/v1/forum/threads/${id}`),

  adminAction: (id: number, action: "pin" | "unpin" | "lock" | "unlock") =>
    api.post(`/api/v1/forum/threads/${id}/admin`, { action }),

  search: (q: string, page = 1) =>
    api.get<{ code: number; data: PageResult<ThreadItem> & { query: string } }>("/api/v1/forum/search", { params: { q, page } })
      .then((r) => r.data),

  uploadImage: (file: File): Promise<{ fingerprint_id: number; url: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ code: number; data: { fingerprint_id: number; url: string } }>("/api/v1/files/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
};
