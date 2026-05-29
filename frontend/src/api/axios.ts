import axios from "axios";
import { tryRefreshToken } from "@/store/auth";

const instance = axios.create({ baseURL: "/api/v1" });

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

instance.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        err.config!.headers.Authorization = `Bearer ${newToken}`;
        return instance(err.config!);
      }
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export const api = {
  get: <T>(url: string, config?: Record<string, unknown>) =>
    instance.get<T>(url, config).then((r) => r.data),
  post: <T>(url: string, data?: unknown, config?: Record<string, unknown>) =>
    instance.post<T>(url, data, config).then((r) => r.data),
  put: <T>(url: string, data?: unknown, config?: Record<string, unknown>) =>
    instance.put<T>(url, data, config).then((r) => r.data),
  delete: <T>(url: string, config?: Record<string, unknown>) =>
    instance.delete<T>(url, config).then((r) => r.data),
};
