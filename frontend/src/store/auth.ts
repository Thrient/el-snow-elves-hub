import { create } from "zustand";
import { api } from "@/api/axios";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  role_names: string[];
  permissions: string[] | null;
  email_verified: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  desktop_online: number;
  web_online: number;

  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;
  hasPerm: (code: string) => boolean;
  setOnlineCount: (desktop: number, web: number) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  desktop_online: 0,
  web_online: 0,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api.post<{ code: number; data: AuthUser }>("/api/v1/auth/login", { email, password });
      set({ user: res.data, loading: false });
    } catch {
      set({ loading: false });
      throw new Error("登录失败");
    }
  },

  register: async (username, email, password) => {
    set({ loading: true });
    try {
      await api.post("/api/v1/auth/register", { username, email, password });
      set({ loading: false });
    } catch {
      set({ loading: false });
      throw new Error("注册失败");
    }
  },

  logout: async () => {
    const uid = get().user?.id;
    if (uid) {
      try { await api.post("/api/v1/auth/logout"); } catch { /* ignore */ }
    }
    set({ user: null });
  },

  validateSession: async () => {
    try {
      const user = await api.get<AuthUser>("/api/v1/auth/me");
      set({ user });
    } catch {
      set({ user: null });
    }
  },

  hasPerm: (code: string) => {
    const { user } = get();
    if (!user?.permissions) return false;
    if (user.permissions.includes("*")) return true;
    return user.permissions.includes(code);
  },

  setOnlineCount: (desktop: number, web: number) => set({ desktop_online: desktop, web_online: web }),
}));
