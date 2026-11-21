import type { ReactNode } from "react";
import { Crosshair, Terminal } from "lucide-react";

export type LoginStyleVariant = "v4" | "ascii";

export interface LoginStyleOption {
  id: LoginStyleVariant;
  label: string;
  shortLabel: string;
  desc: string;
  icon: (size?: number) => ReactNode;
}

export const LOGIN_STYLE_OPTIONS: readonly LoginStyleOption[] = [
  {
    id: "v4",
    label: "流星头盔 HUD (V4)",
    shortLabel: "HUD V4",
    desc: "第一人称宇航员头盔 HUD 与破空流星视差",
    icon: (size = 13) => <Crosshair size={size} />,
  },
  {
    id: "ascii",
    label: "ASCII 拟物风",
    shortLabel: "ASCII",
    desc: "3D 货币符号 ASCII 矩阵与拟物硬件登录器",
    icon: (size = 13) => <Terminal size={size} />,
  },
];

const STORAGE_KEY = "hub.login.style-variant";

function normalizeVariant(value: string | null): LoginStyleVariant {
  if (value === "v4" || value === "ascii") return value;
  return "v4";
}

export function loadLoginStyleVariant(): LoginStyleVariant {
  if (typeof window === "undefined") return "v4";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return normalizeVariant(saved);
  } catch {
    // ignore
  }
  return "v4";
}

export function saveLoginStyleVariant(variant: LoginStyleVariant): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // ignore
  }
}

interface LoginStyleSwitcherProps {
  current: LoginStyleVariant;
  onChange: (next: LoginStyleVariant) => void;
}

export function LoginStyleSwitcher({
  current,
  onChange,
}: LoginStyleSwitcherProps) {
  return (
    <div className="group fixed right-0 top-0 z-50 p-4 select-none">
      <div
        className="flex items-center gap-1 rounded-full p-1 text-xs text-white/70 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto -translate-y-1 group-hover:translate-y-0 transition-all duration-300 ease-out"
        style={{
          background: "rgba(18, 18, 24, 0.82)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 12px 32px rgba(0, 0, 0, 0.6)",
        }}
        role="tablist"
        aria-label="登录页样式切换"
      >
        {LOGIN_STYLE_OPTIONS.map((opt) => {
          const isActive = current === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={`${opt.label}：${opt.desc}`}
              onClick={() => {
                if (opt.id !== current) {
                  onChange(opt.id);
                  saveLoginStyleVariant(opt.id);
                }
              }}
              className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-white/18 text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`transition-colors duration-200 ${
                  isActive
                    ? "text-emerald-400"
                    : "text-white/50 group-hover:text-white/80"
                }`}
              >
                {opt.icon(13)}
              </span>
              <span className="hidden sm:inline">{opt.label}</span>
              <span className="inline sm:hidden">{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}