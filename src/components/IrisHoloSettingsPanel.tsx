import { useState, useEffect, useCallback, useRef } from "react";
import { SlidersHorizontal, RotateCcw, X, Copy, Check } from "lucide-react";
import type { HoloSpecimenId } from "./CrestedIrisHoloHeroCanvas";

export interface IrisHoloSettings {
  /** 亮珠生成数量/覆盖率（0 为关闭，1.0 为全叶脉密集流光） */
  sparkDensity: number;
  /** 亮珠沿茎与花瓣条纹游走的速度倍率 */
  sparkSpeed: number;
  /** 亮珠沿条纹向后拖曳的拉丝尾迹长度倍率（0 为圆珠无拖尾，越大拉丝越修长） */
  sparkTrailLength: number;
  /** 亮珠自身核心与拖尾的 HDR 发光强度 */
  sparkGlow: number;
  /** 后处理 Bloom 全局辉光强度 */
  bloomIntensity: number;
  /** 半透明虹彩玻璃花瓣的透明度倍率 */
  petalOpacity: number;
  /** 花瓣磨砂玻璃粗糙模糊度（0 为清玻璃，1.0+ 为细腻磨砂玻璃漫射） */
  frostBlur: number;
  /** 薄膜光学干涉色散浓郁度 */
  iridescenceStrength: number;
  /** 薄膜干涉光谱色相偏移（0.0 ~ 1.0，使不同植物呈现专属光谱主调） */
  spectrumShift: number;
  /** 花瓣放射叶脉条纹密度 */
  contourDensity: number;
  /** 花体自然呼吸微摆速率 */
  motionSpeed: number;
}

/** 三个模型各自独立的默认渲染预设，使三株植物一登场即具备截然不同的光学质感 */
export const DEFAULT_SPECIMEN_HOLO_SETTINGS: Record<
  HoloSpecimenId,
  IrisHoloSettings
> = {
  iris: {
    sparkDensity: 0.55,
    sparkSpeed: 1.0,
    sparkTrailLength: 1.2,
    sparkGlow: 1.15,
    bloomIntensity: 0.42,
    petalOpacity: 0.88,
    frostBlur: 1.15,
    iridescenceStrength: 1.15,
    spectrumShift: 0.0,
    contourDensity: 3.6,
    motionSpeed: 1.0,
  },
  orchid: {
    sparkDensity: 0.72,
    sparkSpeed: 0.78,
    sparkTrailLength: 2.15,
    sparkGlow: 1.38,
    bloomIntensity: 0.56,
    petalOpacity: 0.76,
    frostBlur: 1.55,
    iridescenceStrength: 1.48,
    spectrumShift: 0.28,
    contourDensity: 2.6,
    motionSpeed: 0.82,
  },
  sakura: {
    sparkDensity: 0.46,
    sparkSpeed: 1.32,
    sparkTrailLength: 0.45,
    sparkGlow: 1.25,
    bloomIntensity: 0.48,
    petalOpacity: 0.92,
    frostBlur: 0.82,
    iridescenceStrength: 1.28,
    spectrumShift: 0.64,
    contourDensity: 4.5,
    motionSpeed: 1.18,
  },
};

export const DEFAULT_IRIS_HOLO_SETTINGS: IrisHoloSettings =
  DEFAULT_SPECIMEN_HOLO_SETTINGS.iris;

export type AllSpecimenHoloSettings = Record<HoloSpecimenId, IrisHoloSettings>;

const STORAGE_KEY = "hub.login.iris-holo-settings.by-specimen.v2";

export function loadAllIrisHoloSettings(): AllSpecimenHoloSettings {
  const result: AllSpecimenHoloSettings = {
    iris: { ...DEFAULT_SPECIMEN_HOLO_SETTINGS.iris },
    orchid: { ...DEFAULT_SPECIMEN_HOLO_SETTINGS.orchid },
    sakura: { ...DEFAULT_SPECIMEN_HOLO_SETTINGS.sakura },
  };
  if (typeof window === "undefined") return result;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    const mapData =
      parsed && typeof parsed === "object" && "bySpecimen" in parsed
        ? parsed.bySpecimen
        : parsed;
    if (!mapData || typeof mapData !== "object") return result;

    (["iris", "orchid", "sakura"] as HoloSpecimenId[]).forEach((specId) => {
      const item = mapData[specId];
      if (item && typeof item === "object") {
        const defaults = DEFAULT_SPECIMEN_HOLO_SETTINGS[specId];
        const merged: IrisHoloSettings = { ...defaults };
        (Object.keys(defaults) as (keyof IrisHoloSettings)[]).forEach((k) => {
          const val = item[k];
          if (typeof val === "number" && !Number.isNaN(val)) {
            merged[k] = val;
          }
        });
        result[specId] = merged;
      }
    });
    return result;
  } catch {
    return result;
  }
}

export function saveAllIrisHoloSettings(all: AllSpecimenHoloSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bySpecimen: all,
        version: 2,
        savedAt: Date.now(),
      })
    );
  } catch {
    // ignore storage errors
  }
}

interface SliderConfig {
  key: keyof IrisHoloSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDER_CONFIGS: readonly SliderConfig[] = [
  {
    key: "sparkDensity",
    label: "流光亮珠数量",
    hint: "控制茎秆与花瓣叶脉上随机生成的游走亮珠密度",
    min: 0.0,
    max: 1.0,
    step: 0.02,
    format: (v) => (v === 0 ? "已关闭" : `${Math.round(v * 100)}%`),
  },
  {
    key: "sparkSpeed",
    label: "亮珠游走速度",
    hint: "控制亮珠从茎根上行及沿花瓣向边缘减速滑行的快慢",
    min: 0.2,
    max: 2.8,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}x`,
  },
  {
    key: "sparkTrailLength",
    label: "亮珠拉丝长度",
    hint: "控制亮珠沿茎秆与花瓣叶脉向后拖曳的流光拉丝尾迹长度",
    min: 0.0,
    max: 3.0,
    step: 0.05,
    format: (v) => (v === 0 ? "无拉丝" : `${Math.round(v * 100)}%`),
  },
  {
    key: "sparkGlow",
    label: "亮珠发光强度",
    hint: "控制游走亮珠核心与彗星微尾的 HDR 亮度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "bloomIntensity",
    label: "全局辉光强度 (Bloom)",
    hint: "控制花冠边缘高光与亮珠的光学漫射辉光强度",
    min: 0.0,
    max: 1.6,
    step: 0.02,
    format: (v) => v.toFixed(2),
  },
  {
    key: "petalOpacity",
    label: "花瓣玻璃透明度",
    hint: "越小花瓣越空灵通透，越大玻璃质感越凝实饱满",
    min: 0.25,
    max: 1.0,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "frostBlur",
    label: "花瓣磨砂模糊度",
    hint: "控制透过花瓣观看后方茎秆与重瓣时的磨砂漫射模糊程度",
    min: 0.0,
    max: 2.2,
    step: 0.05,
    format: (v) => (v === 0 ? "清玻璃" : `${Math.round(v * 100)}%`),
  },
  {
    key: "iridescenceStrength",
    label: "薄膜干涉色散强度",
    hint: "控制冰青、电光蓝、紫罗兰与翡翠绿的虹彩浓郁度",
    min: 0.2,
    max: 2.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "spectrumShift",
    label: "光谱色相偏移",
    hint: "偏移薄膜干涉相位色盘，赋予不同植物专属主色调",
    min: 0.0,
    max: 1.0,
    step: 0.02,
    format: (v) => `${Math.round(v * 360)}°`,
  },
  {
    key: "contourDensity",
    label: "叶脉条纹密度",
    hint: "控制由花瓣根部向边缘发散的叶脉流线疏密程度",
    min: 1.5,
    max: 6.0,
    step: 0.1,
    format: (v) => `${v.toFixed(1)}x`,
  },
  {
    key: "motionSpeed",
    label: "花体呼吸微摆速率",
    hint: "控制蝴蝶花整体随微风柔和呼吸摇曳的速度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => (v === 0 ? "已静止" : `${v.toFixed(2)}x`),
  },
];

const SPECIMEN_BADGE_LABELS: Record<HoloSpecimenId, string> = {
  iris: "01.蝴蝶花 · IRIS",
  orchid: "02.白及 · ORCHID",
  sakura: "03.河津樱 · SAKURA",
};

interface IrisHoloSettingsPanelProps {
  specimenId: HoloSpecimenId;
  settings: IrisHoloSettings;
  onChange: (next: IrisHoloSettings) => void;
  onReset: () => void;
}

export function IrisHoloSettingsPanel({
  specimenId,
  settings,
  onChange,
  onReset,
}: IrisHoloSettingsPanelProps) {
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
    (key: keyof IrisHoloSettings, nextVal: number) => {
      const nextSettings: IrisHoloSettings = {
        ...settings,
        [key]: nextVal,
      };
      onChange(nextSettings);

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
      await navigator.clipboard.writeText(
        JSON.stringify({ specimenId, settings }, null, 2)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [specimenId, settings]);

  const handleResetInternal = useCallback(() => {
    onReset();
  }, [onReset]);

  const showTrigger = nearCorner || open;

  return (
    <div
      data-draggable-module="true"
      className="fixed left-4 top-4 z-50 select-none"
    >
      {/* 左上角隐藏触发按钮（鼠标移近左上角时显现，对齐其他登录页体验） */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="蝴蝶花全息图谱视觉参数调校"
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
                  全息图谱调校控制台
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400/80">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    justSaved ? "bg-emerald-300 scale-125" : "bg-emerald-400/60"
                  } transition-all duration-200`}
                />
                <span>
                  {justSaved
                    ? "正在保存..."
                    : `当前控制：${SPECIMEN_BADGE_LABELS[specimenId]}`}
                </span>
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
