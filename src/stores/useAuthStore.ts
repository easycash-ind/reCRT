import { create } from "zustand";
import api from "../services/api";

interface User {
  email: string;
  name: string | null;
  is_guest: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  logout: () => void;
  /** Playground 顶栏展示已登录用户态 */
  setPreviewUser: (enabled: boolean) => void;
}

const PREVIEW_USER: User = {
  email: "designer@recrt.local",
  name: "Designer",
  is_guest: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      await api.get<User>("/api/auth/me");
      set({
        user: { email: "preview@recrt.local", name: "Preview", is_guest: true },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  setPreviewUser: (enabled) => {
    set(
      enabled
        ? { user: PREVIEW_USER, isAuthenticated: true, isLoading: false }
        : { user: null, isAuthenticated: false, isLoading: false },
    );
  },
}));