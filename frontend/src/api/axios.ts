import axios from "axios";
import { tryRefreshToken } from "@/store/auth";
import { bus } from "@/event/bus";

const instance = axios.create();

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

instance.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!axios.isAxiosError(err) || !err.response) {
      // 网络错误 / 超时 —— 调用方自行处理
      return Promise.reject(err);
    }

    const { status } = err.response;

    switch (status) {
      case 401: {
        if (!refreshPromise) {
          refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          err.config!.headers.Authorization = `Bearer ${newToken}`;
          return instance(err.config!);
        }
        bus.emit("auth:expired");
        break;
      }
      // case 403: ...  待扩展
      // case 429: ...  待扩展
      default:
        break;
    }

    // 已拦截但未重试成功（如 401 刷新失败），或未拦截的状态码，原样抛出
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
