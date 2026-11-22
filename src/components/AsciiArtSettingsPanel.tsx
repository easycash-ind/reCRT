import { useState, useEffect, useCallback, useRef } from "react";
import { SlidersHorizontal, RotateCcw, X, Copy, Check } from "lucide-react";

export interface AsciiArtSettings {
  /** 屏幕纵向字符行数（数值越小，单个 ASCII 货币字符越大） */
  gridRows: number;
  /** 字符在格子内的缩放饱满度（越大越饱满） */
  charScale: number;
  /** 字符间距 / 矩阵分隔黑线宽度（越小越紧凑） */
  cellGap: number;
  /** 字符笔画粗壮度 / 荧光膨胀感 */
  strokeBoldness: number;
  /** 字符辉光与光学漫射总强度 */
  glowIntensity: number;
  /** 受光中心炽白高光核亮度 */
  coreBrightness: number;
  /** 环境光晕漫射半径与浓郁度 */
  haloSpread: number;
  /** 复古 CRT 矩阵点阵与扫描暗纹清晰度 */
  crtGridOpacity: number;
  /** 左上角背景斜向平行光强度 */
  bgBeamIntensity: number;
  /** 登录器左侧与顶部边缘反光强度 */
  consoleBounceIntensity: number;
  /** 登录器边缘反光光晕扩散范围 */
  consoleBounceSpread: number;
  /** 横向复古扫描破形（水平拉丝与行微错位）强度 */
  horizGlitch: number;
  /** 左侧 3D 模型整体缩放大小倍率 */
  modelScale: number;
  /** 3D 挤压厚度倍率 */
  extrudeScale: number;
  /** 3D 材质粗糙度（默认 0.80 即 80%） */
  roughness: number;
  /** 动画旋转速度倍率（0 为暂停定格） */
  rotationSpeed: number;
  /**
   * 模型歪斜随机强度（0 = 完全立正；1 = 满额随机倾角上限）。
   * 控制每个货币符号俯仰 / 侧倾的随机偏斜幅度上限。
   */
  tiltRandomness: number;
  /** 登录方式选中态点阵白底外围辉光强度（0 = 无辉光） */
  tabPillGlow: number;
  /** 落樱风洞：微风吹拂与枝头摇曳强度（0 = 静止无风） */
  windStrength: number;
  /** 落樱风洞：飘落花瓣数量（默认 14 片，少而精） */
  petalCount: number;
  /** 落樱风洞：飘落花瓣尺寸倍率（默认 1.50 即 150%） */
  petalSize: number;
  /** 落樱风洞：花瓣剥离飘落密度与速度（向后兼容） */
  petalFallDensity: number;
  /** 落樱风洞：Voronoi 粘连花瓣簇呼吸解构张开幅度（0 = 紧密闭合） */
  deconstructAmount: number;
  /** 赛博枯荣：四季生命周期流转速度倍率（0 = 暂停定格在当前季节） */
  vanitasCycleSpeed: number;
  /** 赛博枯荣：物种锁定选择（0 = 三物种星尘自动轮回, 1 = 河津樱, 2 = 山杜鹃, 3 = 大紫杜鹃） */
  vanitasSpeciesLock: number;
  /** 赛博枯荣：秋冬熵增风化剥离与反重力星尘升腾强度 */
  entropyIntensity: number;
  /** 赛博枯荣：春季测地线生长前沿的生物电脉冲辉光 */
  genesisGlow: number;
  /** 植物生物电：伪彩光谱模式（0=红外热成像, 1=深海生物荧光, 2=原生大紫杜鹃, 3=单色示波器） */
  bioSpectrum: number;
  /** 植物生物电：测地线动作电位脉冲传导频率（0.2..2.5，默认 1.0） */
  bioPulseSpeed: number;
  /** 植物生物电：动作电位脉冲与突触放电强度（0.0..2.5，默认 1.2） */
  bioPulseIntensity: number;
  /** 植物生物电：热核与动作电位尾迹扩散范围（0.2..2.0，默认 1.0） */
  bioThermalSpread: number;
}

export const DEFAULT_ASCII_ART_SETTINGS: AsciiArtSettings = {
  gridRows: 46,
  charScale: 1.18,
  cellGap: 0.05,
  strokeBoldness: 0.45,
  glowIntensity: 2.85,
  coreBrightness: 2.35,
  haloSpread: 1.55,
  crtGridOpacity: 1.05,
  bgBeamIntensity: 1.0,
  consoleBounceIntensity: 1.0,
  consoleBounceSpread: 1.0,
  horizGlitch: 0.68,
  modelScale: 1.0,
  extrudeScale: 0.8,
  roughness: 0.8,
  rotationSpeed: 1.0,
  tiltRandomness: 0.65,
  tabPillGlow: 0.9,
  windStrength: 1.0,
  petalCount: 10,
  petalSize: 1.2,
  petalFallDensity: 1.0,
  deconstructAmount: 1.0,
  vanitasCycleSpeed: 1.0,
  vanitasSpeciesLock: 0,
  entropyIntensity: 1.0,
  genesisGlow: 1.0,
  bioSpectrum: 2,
  bioPulseSpeed: 1.0,
  bioPulseIntensity: 1.2,
  bioThermalSpread: 1.0,
};

const PRIMARY_STORAGE_KEY = "hub.login.ascii-art-settings.v11";
const LEGACY_STORAGE_KEYS = [
  "hub.login.ascii-art-settings.v10",
  "hub.login.ascii-art-settings.v9",
  "hub.login.ascii-art-settings.v8",
  "hub.login.ascii-art-settings.v7",
  "hub.login.ascii-art-settings.v6",
  "hub.login.ascii-art-settings.v5",
  "hub.login.ascii-art-settings",
];

export function loadAsciiArtSettings(): AsciiArtSettings {
  if (typeof window === "undefined") return DEFAULT_ASCII_ART_SETTINGS;
  try {
    let raw = window.localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyVal = window.localStorage.getItem(legacyKey);
        if (legacyVal) {
          raw = legacyVal;
          break;
        }
      }
    }
    if (!raw) return DEFAULT_ASCII_ART_SETTINGS;

    const parsed = JSON.parse(raw);
    const data: Partial<AsciiArtSettings> =
      parsed && typeof parsed === "object" && "settings" in parsed
        ? parsed.settings
        : parsed;

    if (!data || typeof data !== "object") return DEFAULT_ASCII_ART_SETTINGS;

    const merged: AsciiArtSettings = { ...DEFAULT_ASCII_ART_SETTINGS };
    (Object.keys(DEFAULT_ASCII_ART_SETTINGS) as (keyof AsciiArtSettings)[]).forEach(
      (k) => {
        const val = data[k];
        if (typeof val === "number" && !Number.isNaN(val)) {
          // 平滑迁移：若为旧版本默认粗糙度（0.7 或 0.9），更新至新默认 80% (0.8)；若为用户手动调节值则保留
          if (
            k === "roughness" &&
            (Math.abs(val - 0.7) < 0.001 || Math.abs(val - 0.9) < 0.001)
          ) {
            merged[k] = 0.8;
          } else {
            merged[k] = val;
          }
        }
      }
    );

    return merged;
  } catch {
    return DEFAULT_ASCII_ART_SETTINGS;
  }
}

export function saveAsciiArtSettings(settings: AsciiArtSettings): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      settings,
      version: 9,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function clearAsciiArtSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PRIMARY_STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

interface SliderConfig {
  key: keyof AsciiArtSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  sakuraOnly?: boolean;
  vanitasOnly?: boolean;
  azaleaOnly?: boolean;
}

const BIO_SPECTRUM_PRESETS: readonly { id: number; label: string; badge: string }[] = [
  { id: 0, label: "红外热成像", badge: "FLIR" },
  { id: 1, label: "深海生物荧光", badge: "BIO" },
  { id: 2, label: "原生大紫杜鹃", badge: "NAT" },
  { id: 3, label: "单色示波器", badge: "P39" },
];

const SLIDER_CONFIGS: readonly SliderConfig[] = [
  {
    key: "bioPulseSpeed",
    label: "生物电脉冲传导频率",
    min: 0.2,
    max: 2.5,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}x`,
    azaleaOnly: true,
  },
  {
    key: "bioPulseIntensity",
    label: "动作电位脉冲强度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    azaleaOnly: true,
  },
  {
    key: "bioThermalSpread",
    label: "热核尾迹扩散半径",
    min: 0.2,
    max: 2.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    azaleaOnly: true,
  },
  {
    key: "vanitasSpeciesLock",
    label: "标本物种选择",
    min: 0,
    max: 3,
    step: 1,
    format: (v) =>
      v === 1
        ? "01 河津樱"
        : v === 2
          ? "02 山杜鹃"
          : v === 3
            ? "03 大紫杜鹃"
            : "自动星尘轮回",
    vanitasOnly: true,
  },
  {
    key: "vanitasCycleSpeed",
    label: "枯荣四季轮回速度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => (v === 0 ? "定格" : `${v.toFixed(2)}x`),
    vanitasOnly: true,
  },
  {
    key: "entropyIntensity",
    label: "秋冬熵增风化升腾度",
    min: 0.2,
    max: 2.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    vanitasOnly: true,
  },
  {
    key: "genesisGlow",
    label: "春季创生生物电脉冲",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    vanitasOnly: true,
  },
  {
    key: "windStrength",
    label: "微风吹拂弹性强度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => (v === 0 ? "静止" : `${Math.round(v * 100)}%`),
    sakuraOnly: true,
  },
  {
    key: "petalCount",
    label: "飘落花瓣数量",
    min: 0,
    max: 36,
    step: 1,
    format: (v) => (v === 0 ? "无落樱" : `${Math.round(v)} 片`),
    sakuraOnly: true,
  },
  {
    key: "petalSize",
    label: "飘落花瓣尺寸",
    min: 0.5,
    max: 3.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
    sakuraOnly: true,
  },
  {
    key: "deconstructAmount",
    label: "花瓣簇呼吸解构度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => (v === 0 ? "原貌" : `${Math.round(v * 100)}%`),
    sakuraOnly: true,
  },
  {
    key: "glowIntensity",
    label: "字符辉光强度",
    min: 0.4,
    max: 5.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: "coreBrightness",
    label: "高光核过曝亮度",
    min: 0.5,
    max: 4.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: "haloSpread",
    label: "环境光晕漫射",
    min: 0.0,
    max: 3.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: "gridRows",
    label: "字符整体大小 (行数)",
    min: 30,
    max: 88,
    step: 1,
    format: (v) => `${Math.round(v)} 行`,
  },
  {
    key: "charScale",
    label: "字符饱满度 (字号缩放)",
    min: 0.65,
    max: 1.5,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "cellGap",
    label: "字符间距 (矩阵缝宽)",
    min: 0.0,
    max: 0.25,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "strokeBoldness",
    label: "字符笔画粗细",
    min: 0.0,
    max: 1.2,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "crtGridOpacity",
    label: "CRT 矩阵点阵暗纹",
    min: 0.0,
    max: 1.5,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "bgBeamIntensity",
    label: "背景斜向平行光强度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "consoleBounceIntensity",
    label: "登录器反光强度",
    min: 0.0,
    max: 3.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "consoleBounceSpread",
    label: "登录器反光光晕范围",
    min: 0.2,
    max: 3.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "horizGlitch",
    label: "横向复古扫描噪波",
    min: 0.0,
    max: 1.5,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "modelScale",
    label: "左侧 3D 模型大小",
    min: 0.4,
    max: 1.8,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "extrudeScale",
    label: "3D 挤压厚度",
    min: 0.2,
    max: 2.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "roughness",
    label: "材质粗糙度",
    min: 0.05,
    max: 1.0,
    step: 0.01,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "rotationSpeed",
    label: "旋转动画速度",
    min: 0.0,
    max: 2.5,
    step: 0.05,
    format: (v) => (v === 0 ? "已定格" : `${v.toFixed(2)}x`),
  },
  {
    key: "tiltRandomness",
    label: "模型歪斜随机强度",
    min: 0.0,
    max: 1.5,
    step: 0.02,
    format: (v) => (v === 0 ? "完全立正" : `${Math.round(v * 100)}%`),
  },
  {
    key: "tabPillGlow",
    label: "选中白底辉光强度",
    min: 0.0,
    max: 2.0,
    step: 0.05,
    format: (v) => (v === 0 ? "无辉光" : `${Math.round(v * 100)}%`),
  },
];

interface AsciiArtSettingsPanelProps {
  settings: AsciiArtSettings;
  onChange: (next: AsciiArtSettings) => void;
  onReset: () => void;
  mode?: "azalea" | "vanitas" | "sakura" | "currency";
}

export function AsciiArtSettingsPanel({
  settings,
  onChange,
  onReset,
  mode = "currency",
}: AsciiArtSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [nearCorner, setNearCorner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 当鼠标靠近页面左上角 130x130px 区域时浮现隐藏设置按钮
      const isNear = e.clientX <= 130 && e.clientY <= 130;
      setNearCorner(isNear);
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleValueChange = useCallback(
    (key: keyof AsciiArtSettings, nextVal: number) => {
      const nextSettings = {
        ...settings,
        [key]: nextVal,
      };
      // 同步触发父组件并立即持久化到本地
      onChange(nextSettings);
      saveAsciiArtSettings(nextSettings);

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
      // fallback
    }
  }, [settings]);

  const handleResetInternal = useCallback(() => {
    clearAsciiArtSettings();
    onReset();
    saveAsciiArtSettings(DEFAULT_ASCII_ART_SETTINGS);
  }, [onReset]);

  const showTrigger = nearCorner || open;

  return (
    <div className="fixed left-4 top-4 z-40 select-none">
      {/* 左上角隐藏触发按钮（鼠标靠近左上角时显现） */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="ASCII 3D 视觉参数设置"
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
            background: "rgba(18, 18, 22, 0.88)",
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
                  视觉调校控制台
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
          <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3.5">
            {mode === "azalea" && (
              <div className="flex flex-col gap-1.5 border-b border-white/10 pb-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/75">伪彩光谱预设 (Spectrum)</span>
                  <span className="font-mono text-emerald-400">
                    {BIO_SPECTRUM_PRESETS[Math.round(settings.bioSpectrum ?? 0)]?.badge ?? "FLIR"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BIO_SPECTRUM_PRESETS.map((preset) => {
                    const active = Math.round(settings.bioSpectrum ?? 0) === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleValueChange("bioSpectrum", preset.id)}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                          active
                            ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50"
                            : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="font-mono text-[10px] opacity-75">
                          {preset.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {SLIDER_CONFIGS.filter((cfg) => {
              if (cfg.azaleaOnly) return mode === "azalea";
              if (cfg.vanitasOnly) return mode === "vanitas";
              if (cfg.sakuraOnly) return mode === "sakura" || mode === "vanitas";
              return true;
            }).map((cfg) => {
              const val = settings[cfg.key];
              const displayVal = cfg.format ? cfg.format(val) : String(val);
              return (
                <div key={cfg.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/75">{cfg.label}</span>
                    <span className="font-mono text-white/90">{displayVal}</span>
                  </div>
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
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/15 accent-emerald-400"
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
