import axios from "axios";
import { bus } from "@/event/bus";

const instance = axios.create();

instance.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!axios.isAxiosError(err) || !err.response) {
      return Promise.reject(err);
    }

    const { status } = err.response;
    const msg: string = err.response?.data?.message || `请求错误 (${status})`;

    if (status === 401) {
      // login/register 的 401 是正常错误（密码错等），不触发登出
      const authUrls = ["/api/v1/auth/login", "/api/v1/auth/register"];
      if (authUrls.includes(err.config?.url || "")) {
        bus.emit("app:error", msg);
        return Promise.reject(err);
      }
      // 其他 401 → 会话已失效（el_token 服务端自动续期，真 401 即不可恢复）
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
  upload: <T>(url: string, data: FormData, onUploadProgress?: (e: any) => void) =>
    instance.post<T>(url, data, { onUploadProgress }).then((r) => r.data),
};
