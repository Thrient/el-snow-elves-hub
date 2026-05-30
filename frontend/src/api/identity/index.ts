import { api } from "@/api/axios";
import type { UserDownload, UserLike } from "@/types";

export const authApi = {
  updateProfile: (username: string) =>
    api.put("/api/v1/auth/me", { username }),
};

export const usersApi = {
  getDownloads: () =>
    api.get<{ code: number; data: UserDownload[] }>("/api/v1/users/me/downloads").then((r) => r.data),

  getLikes: () =>
    api.get<{ code: number; data: UserLike[] }>("/api/v1/users/me/likes").then((r) => r.data),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ code: number; data: { avatar_url: string } }>("/api/v1/users/me/avatar", fd);
  },
};
