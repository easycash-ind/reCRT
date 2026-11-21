import { useState, useEffect, useCallback, useRef } from "react";
import { SlidersHorizontal, RotateCcw, X, Copy, Check } from "lucide-react";

export interface HelmetHudSettings {
  /** 整个画面的色彩饱和度倍率（1.0 为原始，>1.0 增强尾焰与画面高饱和度） */
  sceneSaturation: number;
  /** 角落物理光学色散光晕总强度 */
  flareIntensity: number;
  /** 角落光晕径向渐晕起点（越小光晕向内延伸越多，越大越收敛在四角尖端） */
  flareVignetteStart: number;
  /** 头盔镜头偶发随机微晃动幅度倍率（0 为关闭晃动，1.0 为默认） */
  swayAmplitude: number;
  /** 头盔镜头偶发随机微晃动频率倍率（越大触发越频繁、呼吸节奏越快） */
  swayFrequency: number;
}

export const DEFAULT_HELMET_HUD_SETTINGS: HelmetHudSettings = {
  sceneSaturation: 1.25,
  flareIntensity: 0.028,
  flareVignetteStart: 0.64,
  swayAmplitude: 1.0,
  swayFrequency: 1.0,
};

const STORAGE_KEY = "hub.login.helmet-hud-settings.v1";

export function loadHelmetHudSettings(): HelmetHudSettings {
  if (typeof window === "undefined") return DEFAULT_HELMET_HUD_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HELMET_HUD_SETTINGS;
    const parsed = JSON.parse(raw);
    const data: Partial<HelmetHudSettings> =
      parsed && typeof parsed === "object" && "settings" in parsed
        ? parsed.settings
        : parsed;

    if (!data || typeof data !== "object") return DEFAULT_HELMET_HUD_SETTINGS;

    const merged: HelmetHudSettings = { ...DEFAULT_HELMET_HUD_SETTINGS };
    (
      Object.keys(DEFAULT_HELMET_HUD_SETTINGS) as (keyof HelmetHudSettings)[]
    ).forEach((k) => {
      const val = data[k];
      if (typeof val === "number" && !Number.isNaN(val)) {
        merged[k] = val;
      }
    });
    return merged;
  } catch {
    return DEFAULT_HELMET_HUD_SETTINGS;
  }
}

export function saveHelmetHudSettings(settings: HelmetHudSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings,
        version: 1,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearHelmetHudSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface SliderConfig {
  key: keyof HelmetHudSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDER_CONFIGS: readonly SliderConfig[] = [
  {
    key: "sceneSaturation",
    label: "画面整体饱和度",
    hint: "控制彗星多相态虹彩尾焰与全局色彩浓郁度",
    min: 0.5,
    max: 2.2,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "flareIntensity",
    label: "整个光晕的强度",
    hint: "控制四角物理光学色散镜头光晕的亮度",
    min: 0.0,
    max: 0.2,
    step: 0.002,
    format: (v) => v.toFixed(3),
  },
  {
    key: "flareVignetteStart",
    label: "光晕渐晕起点",
    hint: "越小向中心延伸越多，越大越收敛于角落外缘",
    min: 0.46,
    max: 0.78,
    step: 0.005,
    format: (v) => v.toFixed(3),
  },
  {
    key: "swayAmplitude",
    label: "镜头随机晃动幅度",
    hint: "控制头盔镜头偶发偏摆与失重呼吸起伏的幅度",
    min: 0.0,
    max: 6.0,
    step: 0.05,
    format: (v) => (v === 0 ? "已关闭" : `${Math.round(v * 100)}%`),
  },
  {
    key: "swayFrequency",
    label: "镜头随机晃动频率",
    hint: "控制偶发微晃动触发间隔与失重漂移快慢",
    min: 0.2,
    max: 3.0,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}x`,
  },
];

interface HelmetHudSettingsPanelProps {
  settings: HelmetHudSettings;
  onChange: (next: HelmetHudSettings) => void;
  onReset: () => void;
}

export function HelmetHudSettingsPanel({
  settings,
  onChange,
  onReset,
}: HelmetHudSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [nearCorner, setNearCorner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const isNear = e.clientX <= 140 && e.clientY <= 140;
      setNearCorner(isNear);
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleValueChange = useCallback(
    (key: keyof HelmetHudSettings, nextVal: number) => {
      const nextSettings: HelmetHudSettings = {
        ...settings,
        [key]: nextVal,
      };
      onChange(nextSettings);
      saveHelmetHudSettings(nextSettings);

      setJustSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => {
        setJustSaved(false);
      }, 1200);
    },
    [onChange, settings]
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [settings]);

  const handleResetInternal = useCallback(() => {
    clearHelmetHudSettings();
    onReset();
    saveHelmetHudSettings(DEFAULT_HELMET_HUD_SETTINGS);
  }, [onReset]);

  const showTrigger = nearCorner || open;

  return (
    <div className="fixed left-4 top-4 z-40 select-none">
      {/* 左上角隐藏触发按钮（鼠标移近左上角时显现，与 ASCII 登录页一致） */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="流星 HUD 光学参数调校"
        className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-white/85 transition-all duration-300 cursor-pointer ${
          showTrigger
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        style={{
          background: "rgba(24, 24, 30, 0.72)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          boxShadow:
            "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.5)",
        }}
      >
        <SlidersHorizontal size={14} className="text-white/80" />
        <span>视觉调校</span>
      </button>

      {/* 参数调节浮动面板 */}
      {open && (
        <div
          className="mt-2.5 flex w-[320px] max-h-[82vh] flex-col overflow-hidden rounded-2xl text-white/90"
          style={{
            background: "rgba(18, 18, 22, 0.86)",
            backdropFilter: "blur(32px) saturate(180%)",
            WebkitBackdropFilter: "blur(32px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow:
              "inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 24px 60px rgba(0, 0, 0, 0.75)",
          }}
        >
          {/* 面板顶栏 */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-emerald-400" />
                <span className="text-xs font-semibold tracking-wide">
                  HUD 光学调校控制台
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400/80">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    justSaved ? "bg-emerald-300 scale-125" : "bg-emerald-400/60"
                  } transition-all duration-200`}
                />
                <span>{justSaved ? "正在保存..." : "参数已实时持久化"}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopy}
                title="复制当前参数 JSON"
                className="flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] text-white/65 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span className="text-emerald-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>复制</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleResetInternal}
                title="恢复默认参数并清空自定义持久化"
                className="flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] text-white/65 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>重置</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="关闭面板"
                className="flex h-6 w-6 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 滑块列表 */}
          <div className="flex flex-col gap-3.5 overflow-y-auto px-4 py-3.5">
            {SLIDER_CONFIGS.map((cfg) => {
              const val = settings[cfg.key];
              const displayVal = cfg.format(val);
              return (
                <div key={cfg.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-white/85">
                      {cfg.label}
                    </span>
                    <span className="font-mono tabular-nums text-white/95">
                      {displayVal}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40">{cfg.hint}</span>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={val}
                    onChange={(e) => {
                      const nextVal = parseFloat(e.target.value);
                      handleValueChange(cfg.key, nextVal);
                    }}
                    className="mt-0.5 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-emerald-400"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
