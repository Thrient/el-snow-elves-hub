import axios from "axios";
import { bus } from "@/event/bus";

const instance = axios.create();

let refreshPromise: Promise<boolean> | null = null;

instance.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!axios.isAxiosError(err) || !err.response) {
      return Promise.reject(err);
    }

    const { status } = err.response;

    // 全局错误通知 — 后端返回 message 字段
    const msg = err.response?.data?.message || `请求错误 (${status})`;
    bus.emit("app:error", msg);

    if (status === 401) {
      // refresh 端点自身 401 不重试 — 避免无限循环
      if (err.config?.url === "/api/v1/auth/refresh") {
        bus.emit("auth:expired");
        return Promise.reject(err);
      }
      if (!refreshPromise) {
        refreshPromise = instance.post("/api/v1/auth/refresh").then(
          () => true,
          () => false,
        ).finally(() => { refreshPromise = null; });
      }
      const ok = await refreshPromise;
      if (ok && err.config) {
        return instance(err.config);
      }
      bus.emit("auth:expired");
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
