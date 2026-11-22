import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import {
  applyHubDisplayModeToDom,
  useHubThemeStore,
} from "../stores/useHubThemeStore";
import {
  CrestedIrisHoloHeroCanvas,
  HOLO_SPECIMENS,
  type HoloSpecimenId,
} from "./CrestedIrisHoloHeroCanvas";
import {
  IrisHoloSettingsPanel,
  DEFAULT_SPECIMEN_HOLO_SETTINGS,
  loadAllIrisHoloSettings,
  saveAllIrisHoloSettings,
  type AllSpecimenHoloSettings,
  type IrisHoloSettings,
} from "./IrisHoloSettingsPanel";
import { IrisScientificOverlay } from "./IrisScientificOverlay";
import { IrisInlineAuthBlock } from "./IrisInlineAuthBlock";
import { HOLO_SPECIMEN_TEXTS } from "./holoSpecimenTexts";

/**
 * 弹性限位可拖拽科研模块容器：
 * - 允许鼠标在一定范围 (maxOffset) 内平滑拖动各个 UI 模块
 * - 自动避让内部 input / button 交互，双击可复位至初始锚点
 */
function DraggableHudModule({
  children,
  className = "",
  maxOffset = 110,
}: {
  children: ReactNode;
  className?: string;
  maxOffset?: number;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const rawDeltaRef = useRef({ x: 0, y: 0 });
  const startPointerRef = useRef({ x: 0, y: 0 });

  const softClamp = (val: number, limit: number) =>
    limit * Math.tanh(val / limit);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, button, a, textarea, select")) {
      return;
    }
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startPointerRef.current = {
      x: e.clientX - rawDeltaRef.current.x,
      y: e.clientY - rawDeltaRef.current.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rawX = e.clientX - startPointerRef.current.x;
    const rawY = e.clientY - startPointerRef.current.y;
    rawDeltaRef.current = { x: rawX, y: rawY };
    setOffset({
      x: softClamp(rawX, maxOffset),
      y: softClamp(rawY, maxOffset),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    rawDeltaRef.current = { x: offset.x, y: offset.y };
    setDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, button, a")) return;
    e.stopPropagation();
    rawDeltaRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      data-draggable-module="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        transform: `translate3d(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px, 0)`,
        transition: dragging
          ? "none"
          : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className={`pointer-events-auto relative ${
        dragging ? "cursor-grabbing z-30" : "cursor-grab"
      } ${className}`}
    >
      {dragging && (
        <div className="pointer-events-none absolute -top-3.5 right-0 text-[7px] tracking-[0.14em] text-cyan-300/80">
          {`Δ[${offset.x >= 0 ? "+" : ""}${Math.round(offset.x)}, ${
            offset.y >= 0 ? "+" : ""
          }${Math.round(offset.y)}]`}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * 植物营养代谢实时监测面板（英文）：
 * - 每次页面启动时随机设定初始营养基数（避免从零开始）
 * - 随花瓣亮珠的生成速率（联动 sparkDensity * sparkSpeed）实时累加营养消耗值
 * - 带有持续柔和呼吸闪烁的生物活性指示圆点
 */
function NutrientMetabolismPanel({
  sparkDensity,
  sparkSpeed,
  title,
  label,
  unit,
  rateLabel,
}: {
  sparkDensity: number;
  sparkSpeed: number;
  title: string;
  label: string;
  unit: string;
  rateLabel: string;
}) {
  const [baseNutrient] = useState(
    () => Math.floor(18400 + Math.random() * 68000)
  );
  const [accumulated, setAccumulated] = useState(0);

  // 每秒生成的花瓣亮珠营养消耗速率（与调校面板中的亮珠密度与速度实时挂钩）
  const uptakeRatePerSec =
    sparkDensity <= 0.005 ? 0 : +(sparkDensity * sparkSpeed * 11.4).toFixed(1);

  useEffect(() => {
    if (uptakeRatePerSec <= 0) return;
    let lastTime = performance.now();
    let timerId: number;

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      // 叠加微小生物代谢随机波动，模拟每一颗花瓣亮珠生成时的营养脉冲消耗
      const jitter = 0.78 + Math.random() * 0.44;
      setAccumulated((prev) => prev + uptakeRatePerSec * dt * jitter);
      timerId = window.setTimeout(tick, 140);
    };

    timerId = window.setTimeout(tick, 140);
    return () => window.clearTimeout(timerId);
  }, [uptakeRatePerSec]);

  const totalConsumed = Math.floor(baseNutrient + accumulated);
  const sessionAdded = Math.floor(accumulated);

  return (
    <div className="space-y-1.5 border border-white/25 bg-black/40 p-2 backdrop-blur-[2px]">
      {/* 顶栏：英文标题 + 持续呼吸闪烁的圆点 */}
      <div className="flex items-center justify-between border-b border-white/15 pb-1">
        <span className="text-[8.5px] font-semibold tracking-[0.16em] text-white/88">
          {title}
        </span>
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
          <span
            className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/55"
            style={{
              animation: "ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite",
            }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.95)]"
            style={{
              animation: "pulse 1.8s ease-in-out infinite",
            }}
          />
        </span>
      </div>

      {/* 主营养消耗读数（初始随机基数 + 实时累加值） */}
      <div className="flex items-baseline justify-between pt-0.5">
        <span className="text-[7px] tracking-[0.14em] text-white/45">
          {label}
        </span>
        <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
          <span className="text-[12px] font-bold tracking-[0.12em] text-white/95">
            {totalConsumed.toLocaleString("en-US")}
          </span>
          <span className="text-[7px] tracking-[0.1em] text-emerald-300/85">
            {`+${sessionAdded.toLocaleString("en-US")} ${unit}`}
          </span>
        </div>
      </div>

      {/* 花瓣亮珠生成与维管束营养输送速率 */}
      <div className="grid grid-cols-2 gap-x-2 border-t border-white/15 pt-1 text-[6.8px] leading-[1.4] tracking-[0.12em] text-white/46 tabular-nums">
        <div>
          <span className="text-white/32">{`${rateLabel} `}</span>
          <span className="text-white/75">{uptakeRatePerSec.toFixed(1)}/S</span>
        </div>
        <div className="text-right">
          <span className="text-white/32">BASE: </span>
          <span className="text-white/65">
            {baseNutrient.toLocaleString("en-US")}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 蝴蝶花 (Iris japonica) 全息薄膜干涉 · 科研解剖海报风格登录页
 * - 3D 核心：cc0__crested_iris_iris_japonica.glb 薄膜色散与参数化等高流线渲染（支持一定范围内鼠标拖拽旋转/位移）
 * - 版式构成：复刻参考图四周环绕科研排版、正交坐标线、折线图表与解剖标注引线（各模块支持弹性限位拖拽）
 * - 登录入口：无缝嵌入右下角 BAMRMOOTRD 科研文本块中
 */
const SPECIMEN_ORDER: readonly HoloSpecimenId[] = ["iris", "orchid", "sakura"];

export function LoginIrisPage() {
  const [sceneReady, setSceneReady] = useState(true);
  const [specimenId, setSpecimenId] = useState<HoloSpecimenId>("iris");
  const [allSettings, setAllSettings] = useState<AllSpecimenHoloSettings>(() =>
    loadAllIrisHoloSettings()
  );
  const calloutSvgRef = useRef<SVGSVGElement | null>(null);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  const currentSpecimen = HOLO_SPECIMENS[specimenId];
  const texts = HOLO_SPECIMEN_TEXTS[specimenId];
  const holoSettings = allSettings[specimenId];

  const handleCycleSpecimen = useCallback(() => {
    setSpecimenId((prev) => {
      const idx = SPECIMEN_ORDER.indexOf(prev);
      return SPECIMEN_ORDER[(idx + 1) % SPECIMEN_ORDER.length];
    });
  }, []);

  const handleSettingsChange = useCallback(
    (next: IrisHoloSettings) => {
      setAllSettings((prev) => {
        const updated: AllSpecimenHoloSettings = {
          ...prev,
          [specimenId]: next,
        };
        saveAllIrisHoloSettings(updated);
        return updated;
      });
    },
    [specimenId]
  );

  const handleSettingsReset = useCallback(() => {
    setAllSettings((prev) => {
      const updated: AllSpecimenHoloSettings = {
        ...prev,
        [specimenId]: { ...DEFAULT_SPECIMEN_HOLO_SETTINGS[specimenId] },
      };
      saveAllIrisHoloSettings(updated);
      return updated;
    });
  }, [specimenId]);

  useLayoutEffect(() => {
    applyHubDisplayModeToDom("dark");
    return () => {
      applyHubDisplayModeToDom(useHubThemeStore.getState().displayMode);
    };
  }, []);

  useEffect(() => {
    if (sceneReady) return;
    const timer = window.setTimeout(() => setSceneReady(true), 2500);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);

  return (
    <div className="hub-shell-root fixed inset-0 overflow-hidden bg-black font-mono text-white select-none cursor-grab active:cursor-grabbing">
      {/* 左上角隐藏式视觉参数调校面板（当前显示哪个植物标本，就独立控制哪个标本的参数） */}
      <IrisHoloSettingsPanel
        specimenId={specimenId}
        settings={holoSettings}
        onChange={handleSettingsChange}
        onReset={handleSettingsReset}
      />

      {/* L0: 中央全屏 3D 蝴蝶花/白及/河津樱全息薄膜干涉与等高流线画布 */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <CrestedIrisHoloHeroCanvas
          onReady={handleSceneReady}
          settings={holoSettings}
          specimenId={specimenId}
          calloutSvgRef={calloutSvgRef}
        />
      </div>

      {/* L1: 科研解剖网格、光谱折线图、跨象限相位弧线与实时跟随 3D 投影点的解剖指向引线 */}
      <IrisScientificOverlay svgRef={calloutSvgRef} specimenId={specimenId} />

      {/* L2: 四周环绕式科研图谱文本排版层 + 右下角内嵌登录终端 */}
      <div className="pointer-events-none relative z-20 flex h-full w-full flex-col justify-between p-4 sm:p-6 lg:p-7">
        {/* 顶部通栏：左上 CROPEA 标题与参数 + 右上科研双线框矩阵表 */}
        <div className="flex w-full items-start justify-between gap-4">
          {/* 左上角区域 */}
          <div className="flex items-start gap-6">
            <DraggableHudModule className="w-[218px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold tracking-[0.22em] text-white/92">
                  {texts.headerCode}
                </span>
                <button
                  type="button"
                  onClick={handleCycleSpecimen}
                  title="切换植物标本 (Iris / Orchid / Sakura)"
                  className="cursor-pointer border border-cyan-300/45 bg-cyan-950/30 px-1.5 py-0.5 text-[7.5px] font-semibold tracking-[0.14em] text-cyan-300 transition-colors hover:border-cyan-200 hover:bg-cyan-400/20 hover:text-white"
                >
                  [NEXT_SPECIMEN -&gt;]
                </button>
              </div>
              <div className="text-[8.5px] leading-[1.45] tracking-[0.14em] text-white/55">
                {`SPECIMEN // ${currentSpecimen.latinName}`}
                <br />
                {`TAXON: ${currentSpecimen.family}`}
                <br />
                {`SCAN_REF: ${currentSpecimen.scanRef}`}
              </div>

              {/* 三株植物标本直接点选切换栏 */}
              <div className="flex items-center gap-1 border-t border-white/20 pt-1.5 text-[7.5px] tracking-[0.12em]">
                {SPECIMEN_ORDER.map((id) => {
                  const item = HOLO_SPECIMENS[id];
                  const active = id === specimenId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSpecimenId(id)}
                      className={`cursor-pointer border px-1.5 py-0.5 transition-all ${
                        active
                          ? "border-emerald-300/75 bg-emerald-400/15 font-semibold text-emerald-200"
                          : "border-white/15 bg-white/5 text-white/45 hover:border-white/35 hover:text-white/80"
                      }`}
                    >
                      {`${item.code}.${item.cnName}`}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/15 pt-1 text-[8px] leading-[1.4] tracking-[0.12em] text-white/40">
                {texts.dispersionLine1}
                <br />
                {texts.dispersionLine2}
              </div>
            </DraggableHudModule>

            {/* 左上折线图题注 */}
            <DraggableHudModule className="hidden w-[180px] space-y-1 pt-0.5 sm:block">
              <div className="text-[9.5px] font-semibold tracking-[0.18em] text-white/75">
                {texts.chartTitle}
              </div>
              <div className="text-[7.5px] tracking-[0.14em] text-white/40">
                {texts.chartSub}
              </div>
            </DraggableHudModule>
          </div>

          {/* 右上角区域：科研矩阵表与波长参数列（与左上角顶边齐平） */}
          <div className="flex items-start gap-5">
            <DraggableHudModule className="hidden text-right text-[8px] leading-[1.55] tracking-[0.15em] text-white/45 xl:block">
              <div>{texts.topRightList[0]}</div>
              <div>{texts.topRightList[1]}</div>
              <div>{texts.topRightList[2]}</div>
              <div>{texts.topRightList[3]}</div>
            </DraggableHudModule>

            <DraggableHudModule className="w-[235px] border border-white/30 bg-black/35 p-2 backdrop-blur-[2px]">
              <div className="border-b border-white/20 pb-1 text-[8.5px] tracking-[0.18em] text-white/80">
                {texts.matrixHeader}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 text-[7.5px] tracking-[0.12em] text-white/52">
                {texts.matrixCells.map((cell, i) => (
                  <span key={i}>{cell}</span>
                ))}
              </div>
            </DraggableHudModule>
          </div>
        </div>

        {/* 中部左右侧栏：高密度错落式科研排版，填满左上中、左下中、右上中、右下底四处空白区域 */}
        <div className="my-2 flex flex-1 w-full items-stretch justify-between py-1">
          {/* 左侧纵列：自上而下均匀分布 4 组错落有致的科研数据与遥测模块 */}
          <div className="hidden w-[225px] flex-col justify-between py-1 lg:flex">
            {/* 左上中区：双栏光谱折射矩阵 + 紧随其下的花瓣亮珠营养消耗实时监测面板 */}
            <div className="space-y-3.5">
              <DraggableHudModule className="space-y-1.5 border-t border-white/20 pt-2">
                <div className="flex items-center justify-between text-[8.5px] font-semibold tracking-[0.18em] text-white/80">
                  <span>{texts.leftTopTitle}</span>
                  <span className="text-[7px] text-cyan-300/70">
                    {texts.leftTopBadge}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[7px] leading-[1.45] tracking-[0.12em] text-white/48">
                  {texts.leftTopGrid.map((item, i) => (
                    <span key={i}>{item}</span>
                  ))}
                </div>
                <div className="flex items-center gap-1 pt-0.5">
                  <span className="h-[3px] w-7 bg-white/55" />
                  <span className="h-[3px] w-3 bg-cyan-300/65" />
                  <span className="h-[3px] w-10 bg-white/20" />
                  <span className="ml-auto text-[6.5px] tracking-[0.15em] text-white/35">
                    {texts.leftTopScaleTag}
                  </span>
                </div>
              </DraggableHudModule>

              {/* 花瓣亮珠营养消耗实时监测面板（英文 + 呼吸圆点 + 随机初值实时累加） */}
              <DraggableHudModule className="w-full">
                <NutrientMetabolismPanel
                  sparkDensity={holoSettings.sparkDensity}
                  sparkSpeed={holoSettings.sparkSpeed}
                  title={texts.nutrientTitle}
                  label={texts.nutrientLabel}
                  unit={texts.nutrientUnit}
                  rateLabel={texts.nutrientRateLabel}
                />
              </DraggableHudModule>
            </div>

            {/* 左中区：形态学特征与圆环指示器 */}
            <DraggableHudModule className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9.5px] font-semibold tracking-[0.18em] text-white/85">
                  {texts.leftMidTitle}
                </span>
                <span className="inline-block h-2 w-2 rounded-full border border-white/55" />
              </div>
              <div className="text-[7.5px] leading-[1.48] tracking-[0.12em] text-white/44">
                {texts.leftMidDesc}
              </div>
              <div className="border-t border-white/15 pt-1.5 text-[7.5px] leading-[1.42] tracking-[0.12em] text-white/38">
                <span className="text-white/68">{texts.leftMidVectorTag}</span>{" "}
                — {texts.leftMidVectorDesc}
              </div>
            </DraggableHudModule>

            {/* 左下中区：跨象限生物电容积分表与多列微字号科研笔记 */}
            <DraggableHudModule className="space-y-1.5 border-t border-white/20 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[8.5px] font-semibold tracking-[0.16em] text-white/78">
                  {texts.leftBotTitle}
                </span>
                <span className="text-[7px] tracking-[0.14em] text-amber-200/65">
                  {texts.leftBotValue}
                </span>
              </div>
              <div className="text-[7px] leading-[1.48] tracking-[0.11em] text-white/42">
                {texts.leftBotDesc}
              </div>
              <div className="grid grid-cols-3 border-t border-white/15 pt-1 text-[6.8px] tracking-[0.12em] text-white/50">
                {texts.leftBotMetrics.map(([k, v], i) => (
                  <div key={i}>
                    <div className="text-white/30">{k}</div>
                    <div>{v}</div>
                  </div>
                ))}
              </div>
            </DraggableHudModule>
          </div>

          {/* 右侧纵列：自上而下错落排布光谱色散表、极坐标参数、BAMRMOOTRD 登录模块与底部校验矩阵 */}
          <div className="ml-auto flex w-[264px] flex-col items-end justify-between py-1">
            {/* 右上中区：多通道薄膜干涉色散列表与微标尺 */}
            <DraggableHudModule className="hidden w-[248px] space-y-1.5 border-t border-white/20 pt-2 text-right lg:block">
              <div className="flex items-center justify-between text-[8.5px] font-semibold tracking-[0.18em] text-white/80">
                <span className="text-[7px] text-purple-300/75">
                  {texts.rightMidTopBadge}
                </span>
                <span>{texts.rightMidTopTitle}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[7px] leading-[1.45] tracking-[0.12em] text-white/46">
                {texts.rightMidTopGrid.map((item, i) => (
                  <span key={i}>{item}</span>
                ))}
              </div>
              <div className="text-[6.8px] leading-[1.4] tracking-[0.11em] text-white/36">
                {texts.rightMidTopFormula}
              </div>
            </DraggableHudModule>

            {/* 右中区：极坐标轴与花冠遥测 */}
            <DraggableHudModule className="hidden w-[230px] text-right text-[7.5px] leading-[1.5] tracking-[0.13em] text-white/42 lg:block">
              <div className="mb-0.5 text-[8.5px] font-semibold text-white/75">
                {texts.rightAxisTitle}
              </div>
              <div>{texts.rightAxisLine1}</div>
              <div>{texts.rightAxisLine2}</div>
            </DraggableHudModule>

            {/* 右下中区：嵌入在周围文本中的可拖动登录模块（对齐参考图 BAMRMOOTRD 区域） */}
            <DraggableHudModule className="w-[248px] sm:w-[264px]" maxOffset={140}>
              <IrisInlineAuthBlock />
            </DraggableHudModule>

            {/* 右下底区：标本几何拓扑与光学通量校验摘要 */}
            <DraggableHudModule className="hidden w-[264px] space-y-1 border-t border-white/20 pt-1.5 text-[7px] leading-[1.42] tracking-[0.12em] text-white/45 lg:block">
              <div className="flex items-center justify-between text-[8px] font-semibold text-white/75">
                <span>{texts.rightBotTitle}</span>
                <span className="text-emerald-300/75">
                  {texts.rightBotStatus}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 text-[6.8px] text-white/42">
                {texts.rightBotMetrics.map((m, i) => (
                  <span key={i}>{m}</span>
                ))}
              </div>
              <div className="text-[6.6px] text-white/34">
                {texts.rightBotArchive}
              </div>
            </DraggableHudModule>
          </div>
        </div>

        {/* 底部通栏：复刻参考图底部分居花茎两侧的 5 栏科研脚注与右下角铭牌 */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-2.5 text-[8px] leading-[1.45] tracking-[0.12em] text-white/48 sm:grid-cols-6">
          {/* Col 1 */}
          <DraggableHudModule className="space-y-1" maxOffset={75}>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-white/85">
              {texts.footerCol1Title}
            </div>
            <div className="text-[7.5px] text-white/40">
              {texts.footerCol1Desc}
            </div>
          </DraggableHudModule>

          {/* Col 2 */}
          <DraggableHudModule className="space-y-1" maxOffset={75}>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-white/85">
              {texts.footerCol2Title}
            </div>
            <div className="text-[7.5px] text-white/40">
              {texts.footerCol2Desc}
            </div>
          </DraggableHudModule>

          {/* Col 3 */}
          <DraggableHudModule className="hidden space-y-1 sm:block" maxOffset={75}>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-white/85">
              {texts.footerCol3Title}
            </div>
            <div className="text-[7.5px] text-white/40">
              {texts.footerCol3Desc}
            </div>
          </DraggableHudModule>

          {/* Col 4: 中央花茎穿行留白区 */}
          <div className="hidden items-end justify-center text-[7.5px] tracking-[0.2em] text-emerald-300/45 sm:flex">
            {texts.footerStemTag}
          </div>

          {/* Col 5 */}
          <DraggableHudModule className="hidden space-y-1 sm:block" maxOffset={75}>
            <div className="text-[10px] font-semibold tracking-[0.18em] text-white/85">
              {texts.footerCol5Code}
            </div>
            <div className="text-[7.5px] text-white/40">
              {texts.footerCol5Desc}
            </div>
          </DraggableHudModule>

          {/* Col 6: 右下角科研边框铭牌 */}
          <DraggableHudModule
            className="hidden border border-white/25 p-1.5 text-[7px] leading-[1.35] text-white/55 sm:block"
            maxOffset={75}
          >
            <div className="flex justify-between border-b border-white/15 pb-0.5 font-semibold text-white/80">
              <span>SPECIMEN_ID</span>
              <span>{`CC0-${specimenId.toUpperCase()}`}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>STATUS: ONLINE</span>
              <span>60.0 FPS</span>
            </div>
          </DraggableHudModule>
        </div>
      </div>

      {/* 初始加载遮罩 */}
      {!sceneReady && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black"
          aria-hidden={sceneReady}
        >
          <Loader2 size={28} className="animate-spin text-white/75" />
        </div>
      )}
    </div>
  );
}
