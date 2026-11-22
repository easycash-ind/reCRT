import type { ReactNode } from "react";
import { Activity, Car, Crosshair, Eye, Flower2, Sparkles, Terminal } from "lucide-react";

export type LoginStyleVariant =
  | "citypop"
  | "iris"
  | "azalea"
  | "vanitas"
  | "sakura"
  | "ascii"
  | "v4";

export interface LoginStyleOption {
  id: LoginStyleVariant;
  label: string;
  shortLabel: string;
  desc: string;
  icon: (size?: number) => ReactNode;
}

export const LOGIN_STYLE_OPTIONS: readonly LoginStyleOption[] = [
  {
    id: "citypop",
    label: "City Pop · 海岸巡航",
    shortLabel: "CityPop",
    desc: "80年代日系 City Pop 海滨双行道公路、DeLorean DMC-12 双视角自动驾驶与程序化随机海岸线",
    icon: (size = 13) => <Car size={size} />,
  },
  {
    id: "iris",
    label: "全息图谱 · 蝴蝶花",
    shortLabel: "蝴蝶花",
    desc: "蝴蝶花薄膜光学干涉、参数化等高流线、科研解剖图谱与嵌入式文本终端登录",
    icon: (size = 13) => <Eye size={size} />,
  },
  {
    id: "azalea",
    label: "生物电 · 热成像",
    shortLabel: "生物电",
    desc: "大紫杜鹃测地线生物电脉冲、四阶伪彩光谱与拟物硬件登录器",
    icon: (size = 13) => <Activity size={size} />,
  },
  {
    id: "vanitas",
    label: "ASCII 枯荣",
    shortLabel: "枯荣",
    desc: "数字永生与熵增：多物种星尘凝聚、绽放与风化消散轮回",
    icon: (size = 13) => <Sparkles size={size} />,
  },
  {
    id: "sakura",
    label: "ASCII 落樱",
    shortLabel: "落樱",
    desc: "河津樱扫描解构、数字风洞与拟物硬件登录器",
    icon: (size = 13) => <Flower2 size={size} />,
  },
  {
    id: "ascii",
    label: "ASCII 货币",
    shortLabel: "货币",
    desc: "3D 货币符号 ASCII 矩阵与拟物硬件登录器",
    icon: (size = 13) => <Terminal size={size} />,
  },
  {
    id: "v4",
    label: "流星头盔 HUD (V4)",
    shortLabel: "HUD V4",
    desc: "第一人称宇航员头盔 HUD 与破空流星视差",
    icon: (size = 13) => <Crosshair size={size} />,
  },
];

const STORAGE_KEY = "hub.login.style-variant.v6";

function normalizeVariant(value: string | null): LoginStyleVariant {
  if (
    value === "citypop" ||
    value === "iris" ||
    value === "azalea" ||
    value === "vanitas" ||
    value === "sakura" ||
    value === "ascii" ||
    value === "v4"
  ) {
    return value;
  }
  return "citypop";
}

export function loadLoginStyleVariant(): LoginStyleVariant {
  if (typeof window === "undefined") return "citypop";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return normalizeVariant(saved);
  } catch {
    // ignore
  }
  return "citypop";
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