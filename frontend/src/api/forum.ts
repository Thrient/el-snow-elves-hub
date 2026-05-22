import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ForumBoard {
  id: number;
  name: string;
  description: string | null;
  thread_count: number;
  created_at: string;
}

export interface PostAuthor {
  id: number;
  username: string;
  avatar_url: string | null;
}

export interface ThreadItem {
  id: number;
  title: string | null;
  content: string;
  author: PostAuthor | null;
  image_urls: string[];
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_reply_at: string | null;
  created_at: string;
}

export interface ReplyItem {
  id: number;
  content: string;
  author: PostAuthor | null;
  parent_id: number | null;
  parent_author: string | null;
  parent_content: string | null;
  image_urls: string[];
  like_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ThreadDetail extends ThreadItem {
  board_id: number;
  board_name: string;
  like_count: number;
  updated_at: string;
  replies: ReplyItem[];
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export const forumApi = {
  listBoards: () =>
    API.get<{ code: number; data: ForumBoard[] }>("/forum/boards").then((r) => r.data.data),

  listThreads: (boardId: number, page = 1) =>
    API.get<{ code: number; data: PageResult<ThreadItem> }>(`/forum/boards/${boardId}/threads`, { params: { page } })
      .then((r) => r.data.data),

  getThread: (id: number) =>
    API.get<{ code: number; data: ThreadDetail }>(`/forum/threads/${id}`).then((r) => r.data.data),

  createThread: (data: { title: string; content: string; board_id: number; image_ids?: number[] }) =>
    API.post("/forum/threads", data).then((r) => r.data),

  createReply: (threadId: number, content: string, parent_id?: number, image_ids?: number[]) =>
    API.post(`/forum/threads/${threadId}/replies`, { content, parent_id, image_ids }).then((r) => r.data),

  likePost: (postId: number) =>
    API.post(`/forum/posts/${postId}/like`).then((r) => r.data),

  updateThread: (id: number, data: { title?: string; content?: string }) =>
    API.put(`/forum/threads/${id}`, data).then((r) => r.data),

  deleteThread: (id: number) =>
    API.delete(`/forum/threads/${id}`).then((r) => r.data),

  adminAction: (id: number, action: "pin" | "unpin" | "lock" | "unlock") =>
    API.post(`/forum/threads/${id}/admin`, { action }).then((r) => r.data),

  search: (q: string, page = 1) =>
    API.get<{ code: number; data: PageResult<ThreadItem> & { query: string } }>("/forum/search", { params: { q, page } })
      .then((r) => r.data.data),

  uploadImage: async (file: File): Promise<{ fingerprint_id: number; url: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const { data } = await API.post<{ code: number; data: { fingerprint_id: number; url: string } }>("/files/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data;
  },
};
