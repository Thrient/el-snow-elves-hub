import { api } from "@/api/axios";
import { uploadFile } from "@/api/storage";
import type { UserDownload, UserLike } from "@/types";

export const authApi = {
  updateProfile: (username: string) =>
    api.put("/api/v1/auth/me", { username }),

  changeEmail: (email: string) =>
    api.put("/api/v1/auth/me/email", { email }),

  resendVerification: () =>
    api.post("/api/v1/auth/resend-verification"),
};

export const usersApi = {
  getDownloads: () =>
    api.get<{ code: number; data: UserDownload[] }>("/api/v1/users/me/downloads").then((r) => r.data),

  getLikes: () =>
    api.get<{ code: number; data: UserLike[] }>("/api/v1/users/me/likes").then((r) => r.data),

  uploadAvatar: async (file: File) => {
    const { fingerprint_id } = await uploadFile(file);
    const fd = new FormData();
    fd.append("fingerprint_id", String(fingerprint_id));
    return api.post<{ code: number; data: { avatar_url: string } }>("/api/v1/users/me/avatar", fd);
  },
};
