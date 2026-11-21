import axios, { type AxiosRequestConfig } from "axios";

const client = axios.create({
  baseURL: "",
  timeout: 12_000,
});

type ApiResponse<T> = { data: T };

const api = {
  post<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    if (url === "/api/auth/send-code") {
      return Promise.resolve({
        data: {
          cooldown: 60,
          devCode: "886611",
          message: "预览模式：验证码已自动填入",
        } as T,
      });
    }
    if (
      url === "/api/auth/verify-code" ||
      url === "/api/auth/login/email" ||
      url === "/api/auth/guest"
    ) {
      return Promise.resolve({ data: {} as T });
    }
    return client.post<T>(url, body);
  },

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    if (url === "/api/auth/me") {
      return Promise.reject({
        response: { status: 401, data: { detail: "预览模式未连接后端" } },
      });
    }
    return client.get<T>(url, config);
  },
};

export default api;