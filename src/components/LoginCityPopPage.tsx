import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Compass,
  Eye,
  Gauge,
  Shuffle,
  Sun,
  Sunset,
} from "lucide-react";
import {
  CityPopHighwayCanvas,
  type CameraViewMode,
  type CityPopHighwaySceneConfig,
  type DrivingLane,
} from "./citypop/CityPopHighwayCanvas";
import { CarStereoPlayer } from "./citypop/CarStereoPlayer";

/**
 * City Pop 海滨双行道公路伪赛车登录页（3D 视觉与 80s 画集/黑胶排版 UI）
 * - 视角 1 (chase)：车后上方第三人称追尾视角
 * - 视角 2 (cockpit)：车内左舵驾驶员第一人称视角
 * - 快捷键：V 切换视角 | A / D 或 ← / → 切换左右车道 | R 随机生成新海岸种子
 */
export function LoginCityPopPage() {
  const [config, setConfig] = useState<CityPopHighwaySceneConfig>(() => {
    const camParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("cam")
        : null;
    return {
      cameraMode:
        camParam === "front" || camParam === "cockpit" ? camParam : "chase",
      lane: "right",
      speedKmh: 118,
      seed: 1985,
      timeOfDay: "noon",
    };
  });
  const [sceneReady, setSceneReady] = useState(false);
  const mileageDomRef = useRef<HTMLSpanElement>(null);

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  useEffect(() => {
    if (sceneReady) return;
    const timer = window.setTimeout(() => setSceneReady(true), 2200);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);

  const toggleCamera = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      cameraMode:
        prev.cameraMode === "chase"
          ? "front"
          : prev.cameraMode === "front"
          ? "cockpit"
          : "chase",
    }));
  }, []);

  const setCameraMode = useCallback((mode: CameraViewMode) => {
    setConfig((prev) => ({ ...prev, cameraMode: mode }));
  }, []);

  const setLane = useCallback((lane: DrivingLane) => {
    setConfig((prev) => ({ ...prev, lane }));
  }, []);

  const randomizeSeed = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      seed: Math.floor(1000 + Math.random() * 9000),
    }));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "v" || key === "c") {
        toggleCamera();
      } else if (key === "a" || e.key === "ArrowLeft") {
        setLane("left");
      } else if (key === "d" || e.key === "ArrowRight") {
        setLane("right");
      } else if (key === "r") {
        randomizeSeed();
      } else if (e.key === "ArrowUp" || key === "w") {
        setConfig((prev) => ({
          ...prev,
          speedKmh: Math.min(200, prev.speedKmh + 10),
        }));
      } else if (e.key === "ArrowDown" || key === "s") {
        setConfig((prev) => ({
          ...prev,
          speedKmh: Math.max(0, prev.speedKmh - 10),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleCamera, setLane, randomizeSeed]);

  const handleTelemetryUpdate = useCallback((zMeters: number) => {
    if (mileageDomRef.current) {
      mileageDomRef.current.textContent = (zMeters / 1000).toFixed(2);
    }
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#003882] select-none">
      {/* 全屏 3D 海滨双行道公路舞台 */}
      <div className="absolute inset-0">
        <CityPopHighwayCanvas
          config={config}
          onReady={handleSceneReady}
          onTelemetryUpdate={handleTelemetryUpdate}
        />
      </div>

      {/* 底部居中：80s 昭和车载 Hi-Fi 音响 / 极细线直角单行控制甲板（1px 锐利分割线、无圆角单行设计） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-3">
        <div className="pointer-events-auto relative flex flex-nowrap items-stretch whitespace-nowrap border border-white/30 bg-[#06122B]/86 text-[#FAF7F0] backdrop-blur-md shadow-[0_14px_36px_rgba(0,12,36,0.55)]">
          {/* 顶部 2px City Pop 标志性三色天际线饰条 */}
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, #EE4256 0%, #EE4256 33%, #FFBD1B 33%, #FFBD1B 66%, #29B2E8 66%, #29B2E8 100%)",
            }}
          />

          {/* 0. 车载卡带音响播放器 + 车厢声学滤波 + Lo-Fi 强度旋钮 */}
          <CarStereoPlayer isCockpitView={config.cameraMode === "cockpit"} />

          {/* 1. 三视角切换组（追尾 Chase / 车头回看 Front / 车内 Cockpit） */}
          <div className="flex items-center border-r border-white/18 px-2 py-1.5">
            <div className="flex items-center border border-white/20 bg-white/5">
              <button
                type="button"
                onClick={() => setCameraMode("chase")}
                className={`flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.1em] transition-colors cursor-pointer ${
                  config.cameraMode === "chase"
                    ? "bg-[#29B2E8] font-semibold text-[#06122B]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title="车后上方第三人称追尾视角 (快捷键 V)"
              >
                <Camera size={12} />
                <span>CHASE 追尾</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraMode("front")}
                className={`flex items-center gap-1.5 border-l border-white/20 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.1em] transition-colors cursor-pointer ${
                  config.cameraMode === "front"
                    ? "bg-[#FFBD1B] font-semibold text-[#06122B]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title="车头正前方镜像回头看车视角 (快捷键 V)"
              >
                <Camera size={12} className="scale-x-[-1]" />
                <span>FRONT 车头</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraMode("cockpit")}
                className={`flex items-center gap-1.5 border-l border-white/20 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.1em] transition-colors cursor-pointer ${
                  config.cameraMode === "cockpit"
                    ? "bg-[#EE4256] font-semibold text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title="车内驾驶员第一人称视角 (快捷键 V)"
              >
                <Eye size={12} />
                <span>COCKPIT 车内</span>
              </button>
            </div>
          </div>

          {/* 2. 双行道车道切换组 */}
          <div className="flex items-center border-r border-white/18 px-2 py-1.5">
            <div className="flex items-center border border-white/20 bg-white/5">
              <button
                type="button"
                onClick={() => setLane("left")}
                className={`px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] transition-colors cursor-pointer ${
                  config.lane === "left"
                    ? "bg-[#FFBD1B] font-semibold text-[#06122B]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title="切换至左侧街景车道 (A / ←)"
              >
                ← 街景道
              </button>
              <button
                type="button"
                onClick={() => setLane("right")}
                className={`border-l border-white/20 px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] transition-colors cursor-pointer ${
                  config.lane === "right"
                    ? "bg-[#29B2E8] font-semibold text-[#06122B]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title="切换至右侧临海车道 (D / →)"
              >
                临海道 →
              </button>
            </div>
          </div>

          {/* 3. 巡航速度调节 */}
          <div className="flex items-center gap-2 border-r border-white/18 px-2.5 py-1.5">
            <Gauge size={12} className="text-[#FFBD1B]" />
            <span className="w-14 font-mono text-[10.5px] font-semibold tracking-[0.1em] text-[#FFBD1B]">
              {config.speedKmh} KM/H
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={config.speedKmh}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  speedKmh: Number(e.target.value),
                }))
              }
              className="h-1 w-16 accent-[#FFBD1B] cursor-pointer"
              aria-label="巡航车速"
            />
          </div>

          {/* 4. 时段色盘切换 */}
          <button
            type="button"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                timeOfDay: prev.timeOfDay === "noon" ? "sunset" : "noon",
              }))
            }
            className="flex items-center gap-1.5 border-r border-white/18 px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.1em] text-white/85 transition-colors hover:bg-white/10 cursor-pointer"
            title="切换正午钴蓝 / 黄昏夕阳色板"
          >
            {config.timeOfDay === "noon" ? (
              <>
                <Sun size={12} className="text-[#29B2E8]" />
                <span>NOON</span>
              </>
            ) : (
              <>
                <Sunset size={12} className="text-[#EE4256]" />
                <span>SUNSET</span>
              </>
            )}
          </button>

          {/* 5. 随机种子按钮 */}
          <button
            type="button"
            onClick={randomizeSeed}
            className="flex items-center gap-1.5 border-r border-white/18 px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-white/85 transition-colors hover:bg-white/10 cursor-pointer"
            title="随机生成新海岸种子 (快捷键 R)"
          >
            <Shuffle size={11} className="text-[#7CC8FF]" />
            <span>#{config.seed}</span>
          </button>

          {/* 6. 里程表 */}
          <div className="hidden items-center gap-1.5 bg-white/5 px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-[#7CC8FF] sm:flex">
            <Compass size={11} />
            <span ref={mileageDomRef}>0.00</span>
            <span>KM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
