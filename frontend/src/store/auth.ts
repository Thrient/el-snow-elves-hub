import { create } from "zustand";
import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  role_names: string[];
  permissions: string[] | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
  refreshToken: () => Promise<boolean>;
  hasPerm: (code: string) => boolean;
}

/** Call this when API returns 401 — tries to refresh, returns true if succeeded */
export async function tryRefreshToken(): Promise<string | null> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return null;
  try {
    const { data } = await axios.post("/api/v1/auth/refresh", { refresh_token: refresh });
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    localStorage.setItem("user", JSON.stringify(data.user));
    useAuthStore.setState({ user: data.user, token: data.access_token });
    return data.access_token;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const { data } = await API.post("/auth/login", { email, password });
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      set({ user: data.user, token: data.access_token, loading: false });
    } catch {
      set({ loading: false });
      throw new Error("登录失败");
    }
  },

  register: async (username, email, password) => {
    set({ loading: true });
    try {
      const { data } = await API.post("/auth/register", { username, email, password });
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));
      set({ user: data.user, token: data.access_token, loading: false });
    } catch {
      set({ loading: false });
      throw new Error("注册失败");
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    set({ user: null, token: null });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem("token");
    const raw = localStorage.getItem("user");
    if (token && raw) {
      try {
        set({ user: JSON.parse(raw), token });
      } catch {
        localStorage.removeItem("user");
      }
    }
  },

  refreshToken: async () => {
    const newToken = await tryRefreshToken();
    return !!newToken;
  },

  hasPerm: (code: string) => {
    const { user } = get();
    if (!user?.permissions) return false;
    if (user.permissions.includes("*")) return true;
    return user.permissions.includes(code);
  },
}));
