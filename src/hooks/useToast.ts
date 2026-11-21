import { createContext, useContext } from "react";

export interface ToastPayload {
  message: string;
  duration?: number;
}

export interface ToastContextValue {
  showToast: (payload: ToastPayload) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}
