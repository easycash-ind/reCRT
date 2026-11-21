import { useState, useCallback } from "react";

/**
 * 登录凭证持久化管理（企业邮箱、登录密码、登录方式）
 * 覆盖所有登录页版本（v4 / ascii / v2 / v1）：
 * 1. 记住用户最近一次输入的企业邮箱
 * 2. 记住用户最近一次输入的密码
 * 3. 页面重新加载、版本切换或退出后重返时，均可自动回填已记忆的信息
 */

export const STORAGE_EMAIL_KEY = "hub.login.remembered-email";
export const STORAGE_PASSWORD_KEY = "hub.login.remembered-password";
export const STORAGE_METHOD_KEY = "hub.login.remembered-method";

export type LoginCredentialMethod = "code" | "password";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

/** 读取最近一次输入的企业邮箱 */
export function getRememberedEmail(): string {
  const storage = getStorage();
  if (!storage) return "";
  try {
    return storage.getItem(STORAGE_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

/** 持久化保存企业邮箱 */
export function saveRememberedEmail(email: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const val = email.trim();
    if (val) {
      storage.setItem(STORAGE_EMAIL_KEY, val);
    } else {
      storage.removeItem(STORAGE_EMAIL_KEY);
    }
  } catch {
    // ignore
  }
}

/** 读取最近一次输入的密码 */
export function getRememberedPassword(): string {
  const storage = getStorage();
  if (!storage) return "";
  try {
    return storage.getItem(STORAGE_PASSWORD_KEY) || "";
  } catch {
    return "";
  }
}

/** 持久化保存密码 */
export function saveRememberedPassword(password: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (password) {
      storage.setItem(STORAGE_PASSWORD_KEY, password);
    } else {
      storage.removeItem(STORAGE_PASSWORD_KEY);
    }
  } catch {
    // ignore
  }
}

/** 读取最近一次使用的登录方式（未设时若已记忆密码则优先推荐密码登录） */
export function getRememberedMethod<M extends string = LoginCredentialMethod>(
  defaultMethod: M = "code" as M
): M {
  const storage = getStorage();
  if (!storage) return defaultMethod;
  try {
    const saved = storage.getItem(STORAGE_METHOD_KEY);
    if (saved === "code" || saved === "password") {
      return saved as M;
    }
    const hasPassword = Boolean(storage.getItem(STORAGE_PASSWORD_KEY));
    if (hasPassword) {
      return "password" as M;
    }
  } catch {
    // ignore
  }
  return defaultMethod;
}

/** 持久化保存登录方式偏好 */
export function saveRememberedMethod(method: LoginCredentialMethod): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_METHOD_KEY, method);
  } catch {
    // ignore
  }
}

/** 批量持久化保存凭证信息 */
export function saveRememberedCredentials(credentials: {
  email?: string;
  password?: string;
  method?: LoginCredentialMethod;
}): void {
  if (typeof credentials.email === "string") {
    saveRememberedEmail(credentials.email);
  }
  if (typeof credentials.password === "string") {
    saveRememberedPassword(credentials.password);
  }
  if (credentials.method) {
    saveRememberedMethod(credentials.method);
  }
}

/** 清除已记忆的凭证 */
export function clearRememberedCredentials(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_EMAIL_KEY);
    storage.removeItem(STORAGE_PASSWORD_KEY);
    storage.removeItem(STORAGE_METHOD_KEY);
  } catch {
    // ignore
  }
}

/**
 * Hook: 统一管理登录页的企业邮箱、密码和登录方式状态
 * 输入变化时自动同步到本地存储，组件挂载时自动回填历史输入。
 */
export function useRememberedCredentials<
  M extends LoginCredentialMethod = LoginCredentialMethod
>() {
  const [email, setEmailState] = useState<string>(() => getRememberedEmail());
  const [password, setPasswordState] = useState<string>(() => getRememberedPassword());
  const [method, setMethodState] = useState<M>(() => getRememberedMethod<M>());

  const setEmail = useCallback((val: string) => {
    setEmailState(val);
    saveRememberedEmail(val);
  }, []);

  const setPassword = useCallback((val: string) => {
    setPasswordState(val);
    saveRememberedPassword(val);
  }, []);

  const setMethod = useCallback((val: M) => {
    setMethodState(val);
    saveRememberedMethod(val);
  }, []);

  const persistCredentials = useCallback(() => {
    saveRememberedCredentials({ email, password, method });
  }, [email, password, method]);

  return {
    email,
    setEmail,
    password,
    setPassword,
    method,
    setMethod,
    persistCredentials,
  };
}
