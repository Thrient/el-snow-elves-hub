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
    const msg: string = err.response?.data?.message || `请求错误 (${status})`;

    if (status === 401) {
      // refresh 自身失败 → 跳转登录
      if (err.config?.url === "/api/v1/auth/refresh") {
        bus.emit("auth:expired");
        return Promise.reject(err);
      }
      // login/register 的 401 是正常错误（密码错等），不触发 refresh
      const authUrls = ["/api/v1/auth/login", "/api/v1/auth/register"];
      if (authUrls.includes(err.config?.url || "")) {
        bus.emit("app:error", msg);
        return Promise.reject(err);
      }
      // 其他 401 → 尝试 refresh token
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
    } else {
      // 非 401 错误 → 全局 toast
      bus.emit("app:error", msg);
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
