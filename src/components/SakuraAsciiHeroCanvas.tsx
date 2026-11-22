import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  createPortal,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene as ThreeScene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import {
  DEFAULT_ASCII_ART_SETTINGS,
  type AsciiArtSettings,
} from "./AsciiArtSettingsPanel";
import {
  createBotanicalGlyphAtlas,
  sakuraAsciiFragmentShader,
  sakuraAsciiVertexShader,
  sakuraBranchFragmentShader,
  sakuraBranchVertexShader,
} from "./sakuraAsciiShaders";

const SAKURA_GLB_URL = "/scan-glb/kawazu_sakura_ascii_ready.glb";
const MAX_PETAL_INSTANCES = 40;

interface FallingPetalState {
  /** 左上角画外归一化出生横坐标 [-0.15, 0.52] */
  spawnNormX: number;
  /** 左上角画外归一化出生纵坐标 [0.72, 1.22] */
  spawnNormY: number;
  spawnZ: number;
  age: number;
  lifeSpan: number;
  initialized: boolean;
  worldPos: Vector3;
  velocity: Vector3;
  rotEuler: Euler;
  rotSpeed: Vector3;
  scale: number;
  flutterPhase: number;
  flutterFreq: number;
  pinkTone: Color;
}

function createInitialPetalStates(): FallingPetalState[] {
  const states: FallingPetalState[] = [];
  for (let i = 0; i < MAX_PETAL_INSTANCES; i++) {
    const goldenPhase = (i * 0.61803398875) % 1.0;
    const subPhase = (i * 0.38196601125) % 1.0;
    const lifeSpan = 6.4 + (i % 5) * 0.8;
    const age = goldenPhase * lifeSpan;

    // 100% 从屏幕外左上角区域飘入画面内（模拟左上角天降花瓣雨效果）：
    // 一半从画面左侧上段画外 (spawnNormX ∈ [-0.14, -0.03]) 顺光束斜飞入画；
    // 一半从画面顶部左中段画外 (spawnNormX ∈ [-0.02, 0.52], spawnNormY ∈ [1.06, 1.22]) 斜飞入画
    const spawnNormX = -0.14 + subPhase * 0.66;
    const spawnNormY =
      spawnNormX < -0.02
        ? 0.65 + goldenPhase * 0.48
        : 1.06 + (i % 5) * 0.038;
    const spawnZ = ((i % 7) - 3) * 0.22;

    // 保持接近纯白的微粉实例色调，避免与材质颜色相乘后把 G/B 通道压低变成大红色
    const pinkTone = new Color().setRGB(
      1.0,
      0.92 + goldenPhase * 0.08,
      0.96 + goldenPhase * 0.04
    );

    states.push({
      spawnNormX,
      spawnNormY,
      spawnZ,
      age,
      lifeSpan,
      initialized: false,
      worldPos: new Vector3(),
      velocity: new Vector3(
        0.86 + (i % 5) * 0.15,
        -0.66 - (i % 4) * 0.11,
        ((i % 5) - 2) * 0.04
      ),
      rotEuler: new Euler(
        (i * 1.1) % 6.28,
        (i * 2.3) % 6.28,
        (i * 0.7) % 6.28
      ),
      rotSpeed: new Vector3(
        1.0 + (i % 5) * 0.32,
        1.3 + (i % 4) * 0.38,
        0.85 + (i % 6) * 0.28
      ),
      scale: 0.56 + (i % 4) * 0.08,
      flutterPhase: i * 1.97,
      flutterFreq: 1.65 + (i % 5) * 0.24,
      pinkTone,
    });
  }
  return states;
}

/**
 * 构建后备单瓣弧面几何体（当 GLB 尚未解析出 SakuraPetalChip 时使用）
 */
function createFallbackPetalGeometry(): BufferGeometry {
  const geo = new PlaneGeometry(0.32, 0.42, 4, 5);
  const pos = geo.attributes.position;
  const metaArray = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = (x * x * 1.4 + y * y * 0.8) * 0.35;
    pos.setZ(i, z);
    metaArray[i * 4 + 0] = 1.0;
    metaArray[i * 4 + 1] = 1.0;
    metaArray[i * 4 + 2] = 0.5;
    metaArray[i * 4 + 3] = 1.0;
  }
  geo.setAttribute("_sakura_meta", new BufferAttribute(metaArray, 4));
  geo.computeVertexNormals();
  return geo;
}

class AsciiErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function StaticSakuraFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-35"
        style={{
          background:
            "linear-gradient(128deg, rgba(255,210,228,0.14) 0%, rgba(0,0,0,0) 14%, rgba(255,190,215,0.18) 24%, rgba(0,0,0,0) 36%, rgba(210,245,215,0.12) 48%, rgba(0,0,0,0) 68%)",
        }}
      />
      <div
        className="absolute left-[32%] top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[76px]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,142,178,0.38) 0%, rgba(255,195,218,0.32) 36%, rgba(110,231,120,0.22) 68%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

const ASIN_NORM = Math.asin(0.98);

/**
 * 单次微风拨动激发的“长杆子长尾阻尼谐振波” (Long-Tail Damped Rod Impulse Wavelet)：
 * - 想象晃动一根长竹竿/长花枝的一头：
 *   1. C^2 光滑起风包络 (0 ~ 0.42s)，零速度突变；
 *   2. 围绕中立平衡位 (0.0) 持续来回摆动 6~8 个周期（长达 12 秒长尾），振幅按 exp(-decayRate * tau) 每一波递减 28%（如 -0.76 -> +0.54 -> -0.38 -> +0.27 -> -0.19 -> +0.13...），呈现极清晰的“一直持续晃动但渐渐收敛回中立位 0”的物理趋势；
 *   3. 采用 asin(0.98 * sin(...)) 尖峰弹性载波，在每个波峰波谷零停顿立刻折返。
 */
function evaluateRodWavelet(
  tau: number,
  amp: number,
  decayRate: number,
  freq: number
): number {
  if (tau <= 0.0 || tau >= 14.0) return 0.0;
  // 0 ~ 0.42s 平滑起风推力包络（一阶与二阶导数连续，绝不卡顿）
  const onset = 0.5 * (1.0 - Math.cos(Math.PI * Math.min(tau / 0.42, 1.0)));
  // 11s ~ 14s 尾端平滑归零窗口
  const tailWindow =
    tau > 11.0 ? Math.pow(1.0 - (tau - 11.0) / 3.0, 2.0) : 1.0;
  // 长尾指数衰减：围绕中立位持续振荡并渐渐收敛
  const decay = Math.exp(-decayRate * tau);
  // 零极值平顶停顿的弹性折返载波
  const carrier = Math.asin(0.98 * Math.sin(freq * tau - 0.35)) / ASIN_NORM;
  return -amp * onset * decay * tailWindow * carrier;
}

/**
 * 交叠阵风脉冲序列（Overlapping Gust Impulse Train）：
 * 每隔约 4.3s ~ 5.6s 吹来一阵新微风——此时上一阵风激发的枝条长尾晃动尚未完全收敛到 0（仍保留约 15%~25% 的轻柔余振），
 * 新风在旧余振的基础上自然叠加，完美还原“在完全收敛到中立位之前又有一阵风晃动了这根枝条”的真实动态！
 */
const GUST_CYCLE_DURATION = 19.2;
const GUST_EVENTS: readonly { offset: number; amp: number; freqScale: number }[] = [
  { offset: 0.0, amp: 1.0, freqScale: 1.0 },
  { offset: 4.7, amp: 0.78, freqScale: 1.04 },
  { offset: 9.2, amp: 1.08, freqScale: 0.97 },
  { offset: 14.3, amp: 0.85, freqScale: 1.02 },
];

function evaluateLongTailBranchRod(
  t: number,
  decayRate = 0.42,
  baseFreq = 4.25
): number {
  // 确保时间正值且包含前一个循环周期遗留的长尾余振
  const safeT = t + GUST_CYCLE_DURATION * 2.0;
  const currentCycleIdx = Math.floor(safeT / GUST_CYCLE_DURATION);
  let sum = 0.0;

  // 叠加当前周期与上一周期的所有阵风长尾响应（保证跨周期 100% 无缝连续）
  for (let c = currentCycleIdx - 1; c <= currentCycleIdx; c++) {
    const cycleStart = c * GUST_CYCLE_DURATION;
    for (let i = 0; i < GUST_EVENTS.length; i++) {
      const ev = GUST_EVENTS[i];
      const tau = safeT - (cycleStart + ev.offset);
      if (tau > 0.0 && tau < 14.0) {
        sum += evaluateRodWavelet(
          tau,
          ev.amp,
          decayRate,
          baseFreq * ev.freqScale
        );
      }
    }
  }
  return sum;
}

function SakuraAsciiPipeline({
  onReady,
  settings,
}: {
  onReady?: () => void;
  settings: AsciiArtSettings;
}) {
  const { gl, size, viewport } = useThree();
  const gltf = useGLTF(SAKURA_GLB_URL);

  const postMatRef = useRef<ShaderMaterial>(null);
  const sakuraHolderRef = useRef<Group>(null);
  const petalInstancedRef = useRef<InstancedMesh>(null);

  const mouseTarget = useRef(new Vector2(0, 0));
  const mouseCurrent = useRef(new Vector2(0, 0));
  const reported = useRef(false);
  const animTimeRef = useRef(0);

  // 缓存右侧登录器在 Canvas UV 空间的坐标框，避免每帧调用 getBoundingClientRect 触发 DOM 回流卡顿
  const consoleRectRef = useRef(new Vector4(0.68, 0.31, 0.91, 0.72));

  const petalStatesRef = useRef<FallingPetalState[]>(createInitialPetalStates());
  const dummyObj = useMemo(() => new Object3D(), []);

  useEffect(() => {
    configurePostProcessingRenderer(gl);
    onReady?.();
  }, [gl, onReady]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      mouseTarget.current.set(nx, ny);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const { texture: glyphAtlas, glyphCount } = useMemo(
    () => createBotanicalGlyphAtlas(),
    []
  );

  // 从 Blender 预处理后的 GLB 中提取主花枝几何体、主贴图以及单瓣粒子几何体
  const { branchGeometry, petalGeometry, sakuraTexture } = useMemo(() => {
    let foundBranchGeo: BufferGeometry | null = null;
    let foundPetalGeo: BufferGeometry | null = null;
    let foundTex: Texture | null = null;

    gltf.scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        const mat = mesh.material as MeshStandardMaterial | undefined;
        if (mat?.map && !foundTex) {
          foundTex = mat.map;
          foundTex.colorSpace = SRGBColorSpace;
          foundTex.needsUpdate = true;
        }
        if (
          mesh.name.includes("PetalChip") ||
          mesh.geometry.name.includes("PetalChip")
        ) {
          foundPetalGeo = mesh.geometry.clone();
        } else if (!foundBranchGeo) {
          foundBranchGeo = mesh.geometry.clone();
        }
      }
    });

    const finalBranchGeo = foundBranchGeo ?? new PlaneGeometry(3, 3);
    const finalPetalGeo = foundPetalGeo ?? createFallbackPetalGeometry();

    return {
      branchGeometry: finalBranchGeo,
      petalGeometry: finalPetalGeo,
      sakuraTexture: foundTex,
    };
  }, [gltf.scene]);

  // 河津樱主花枝自定义风场 + 二阶物理弹簧 ShaderMaterial
  const branchShaderMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: sakuraBranchVertexShader,
      fragmentShader: sakuraBranchFragmentShader,
      uniforms: {
        uMap: { value: sakuraTexture },
        uTime: { value: 0 },
        uWindStrength: { value: settings.windStrength ?? 1.0 },
        uDeconstructAmount: { value: settings.deconstructAmount ?? 1.0 },
        uGustEnvelope: { value: 0.5 },
        uBranchSpringAngles: { value: new Vector3(0, 0, 0) },
        uRoughness: { value: settings.roughness },
        uKeyLightTop: { value: new Vector3(0, 2, 3) },
        uKeyLightBottom: { value: new Vector3(0, -2, 3) },
        uRimLightDir: { value: new Vector3(-4, 3, -2) },
      },
      side: DoubleSide,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sakuraTexture]);

  // 飘落单瓣材质：与 sakuraBranchFragmentShader 的河津樱粉 (vec3(1.0, 0.48, 0.74) ~ vec3(1.0, 0.88, 0.94)) 严格对齐！
  // 提高 G 与 B 通道比例，彻底消除之前因通道相乘导致的“偏大红色”现象
  const petalMaterial = useMemo(() => {
    return new MeshStandardMaterial({
      color: new Color(1.0, 0.56, 0.82),
      emissive: new Color(1.0, 0.44, 0.74),
      emissiveIntensity: 0.34,
      roughness: 0.62,
      metalness: 0.02,
      side: DoubleSide,
    });
  }, []);

  useEffect(() => {
    if (!petalInstancedRef.current) return;
    const states = petalStatesRef.current;
    for (let i = 0; i < MAX_PETAL_INSTANCES; i++) {
      petalInstancedRef.current.setColorAt(i, states[i].pinkTone);
    }
    if (petalInstancedRef.current.instanceColor) {
      petalInstancedRef.current.instanceColor.needsUpdate = true;
    }
  }, []);

  const offscreenScene = useMemo(() => new ThreeScene(), []);
  const offscreenCamera = useMemo(() => {
    const cam = new PerspectiveCamera(36, 1, 0.1, 100);
    cam.position.set(0, 0, 10.5);
    return cam;
  }, []);

  const renderTarget = useMemo(() => {
    return new WebGLRenderTarget(512, 512, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
    });
  }, []);

  const glowTarget = useMemo(() => {
    return new WebGLRenderTarget(64, 64, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
    });
  }, []);

  useEffect(() => {
    offscreenCamera.aspect = size.width / Math.max(size.height, 1);
    offscreenCamera.updateProjectionMatrix();

    // 仅在窗口尺寸变化或初始化时测量一次右侧登录器坐标，彻底杜绝每帧 getBoundingClientRect 引起的微卡顿
    const updateConsoleBounds = () => {
      const consoleEl = document.querySelector(
        '[data-tactile-console-form="true"]'
      );
      const canvasRect = gl.domElement.getBoundingClientRect();
      if (consoleEl && canvasRect.width > 0 && canvasRect.height > 0) {
        const rect = consoleEl.getBoundingClientRect();
        const relLeft = rect.left - canvasRect.left;
        const relTop = rect.top - canvasRect.top;
        const cMinX = (relLeft + rect.width * 0.1396) / canvasRect.width;
        const cMaxX = (relLeft + rect.width * 0.8125) / canvasRect.width;
        const cMaxY = 1.0 - (relTop + rect.height * 0.1221) / canvasRect.height;
        const cMinY = 1.0 - (relTop + rect.height * 0.752) / canvasRect.height;
        consoleRectRef.current.set(cMinX, cMinY, cMaxX, cMaxY);
      }
    };
    updateConsoleBounds();
    const timer = window.setTimeout(updateConsoleBounds, 300);
    return () => window.clearTimeout(timer);
  }, [size.width, size.height, offscreenCamera, gl]);

  const uniforms = useMemo(
    () => ({
      uSceneTex: { value: renderTarget.texture },
      uGlowTex: { value: glowTarget.texture },
      uGlyphAtlas: { value: glyphAtlas },
      uGlyphCount: { value: glyphCount },
      uResolution: { value: new Vector2(size.width, size.height) },
      uTime: { value: 0 },
      uFocusCenter: { value: new Vector2(0.32, 0.5) },
      uGridRows: { value: settings.gridRows },
      uCharScale: { value: settings.charScale },
      uCellGap: { value: settings.cellGap },
      uStrokeBoldness: { value: settings.strokeBoldness },
      uGlowIntensity: { value: settings.glowIntensity },
      uCoreBrightness: { value: settings.coreBrightness },
      uHaloSpread: { value: settings.haloSpread },
      uCrtGridOpacity: { value: settings.crtGridOpacity },
      uBgBeamIntensity: { value: settings.bgBeamIntensity },
      uConsoleBounceIntensity: { value: settings.consoleBounceIntensity },
      uConsoleBounceSpread: { value: settings.consoleBounceSpread },
      uConsoleRect: { value: new Vector4(0.68, 0.31, 0.91, 0.72) },
      uHorizGlitch: { value: settings.horizGlitch },
      uWindStrength: { value: settings.windStrength ?? 1.0 },
      uPetalBouncePulse: { value: 1.0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderTarget, glowTarget, glyphAtlas, glyphCount]
  );

  useFrame((state, delta) => {
    const clampedDelta = Math.min(delta, 0.1);
    animTimeRef.current += clampedDelta * settings.rotationSpeed;
    const elapsed = animTimeRef.current;
    const realTime = state.clock.getElapsedTime();

    if (!reported.current && onReady) {
      reported.current = true;
      onReady();
    }

    mouseCurrent.current.x = MathUtils.lerp(
      mouseCurrent.current.x,
      mouseTarget.current.x,
      0.06
    );
    mouseCurrent.current.y = MathUtils.lerp(
      mouseCurrent.current.y,
      mouseTarget.current.y,
      0.06
    );

    const isDesktop = size.width >= 900;
    // 探枝入画黄金构图：使左端枝干断口恰好没入屏幕最左边界外 (x < 0)，
    // 画面左侧露出一小段苍劲的琥珀色花枝从左框外斜伸入光束，枝头托起盛开的花簇探入左侧视觉中心
    const branchCenterNormX = isDesktop ? 0.225 : 0.35;
    const branchCenterNormY = isDesktop ? 0.545 : 0.34;
    const focusNormX = isDesktop ? 0.285 : 0.44;
    const focusNormY = isDesktop ? 0.51 : 0.30;

    const vHeight =
      2 *
      Math.tan(MathUtils.degToRad(offscreenCamera.fov * 0.5)) *
      offscreenCamera.position.z;
    const vWidth = vHeight * offscreenCamera.aspect;

    const worldX = (branchCenterNormX - 0.5) * vWidth;
    const worldY = (branchCenterNormY - 0.5) * vHeight;
    const focusWorldX = (focusNormX - 0.5) * vWidth;
    const focusWorldY = (focusNormY - 0.5) * vHeight;

    const windStr = settings.windStrength ?? 1.0;
    const targetPetalCount = Math.round(
      MathUtils.clamp(settings.petalCount ?? 10, 0, MAX_PETAL_INSTANCES)
    );
    const petalSizeMult = settings.petalSize ?? 1.2;
    const deconstructAmt = settings.deconstructAmount ?? 1.0;
    const modelScale = settings.modelScale ?? 1.0;
    const tiltAmt = settings.tiltRandomness ?? 0.65;

    // 长杆子长尾阻尼谐振 + 未停稳前新风交叠激发 (Long-Tail Rod Oscillation with Overlapping Gusts)：
    // 1. 主枝基部 (primarySwayXY)：围绕中立位 (0.0) 持续来回晃动并以 decayRate=0.42 渐渐向中立位收敛；
    // 2. 枝梢长尾鞭梢 (tipFollowXY)：模拟长杆子末梢的柔性传导，相位滞后 0.18s 且长尾衰减更慢 (decayRate=0.33)，
    //    当基部快收敛时，枝头还在带着弹力轻轻余振，且在完全停稳前被下一阵风再次拨动！
    const primarySwayXY =
      evaluateLongTailBranchRod(elapsed, 0.42, 4.25) * 0.048 * windStr;

    const tipFollowXY =
      evaluateLongTailBranchRod(elapsed - 0.18, 0.33, 4.25) * 0.044 * windStr;

    const primarySwayXZ =
      evaluateLongTailBranchRod(elapsed - 0.10, 0.38, 3.85) * 0.026 * windStr;

    const gustEnvelope = MathUtils.clamp(
      0.45 + Math.abs(primarySwayXY) * 12.0,
      0.25,
      1.25
    );

    const basePitch = 0.06 + (tiltAmt - 0.65) * 0.12 + mouseCurrent.current.y * 0.05;
    const baseYaw = 0.08 + mouseCurrent.current.x * 0.06;
    const baseRoll = -0.14;

    const baseScale = (isDesktop ? 1.24 : 0.88) * modelScale;

    if (sakuraHolderRef.current) {
      sakuraHolderRef.current.position.set(worldX, worldY, 0);
      sakuraHolderRef.current.rotation.set(basePitch, baseYaw, baseRoll);
      sakuraHolderRef.current.scale.set(
        baseScale,
        baseScale,
        baseScale * MathUtils.lerp(0.75, 1.15, settings.extrudeScale * 0.5)
      );
      sakuraHolderRef.current.updateMatrixWorld();
    }

    const lightSpan = 0.85 + 0.35 * modelScale;
    const keyTopX = focusWorldX - 0.65 * lightSpan + Math.sin(realTime * 0.7) * 0.18;
    const keyTopY = focusWorldY + 1.15 * lightSpan + Math.cos(realTime * 0.5) * 0.15;
    const keyBotX = focusWorldX + 0.55 * lightSpan;
    const keyBotY = focusWorldY - 0.95 * lightSpan;

    // 更新河津樱主花枝 Shader Uniforms
    const bu = branchShaderMaterial.uniforms;
    bu.uTime.value = elapsed;
    bu.uWindStrength.value = windStr;
    bu.uDeconstructAmount.value = deconstructAmt;
    bu.uGustEnvelope.value = gustEnvelope;
    bu.uBranchSpringAngles.value.set(primarySwayXY, tipFollowXY, primarySwayXZ);
    bu.uRoughness.value = settings.roughness;
    bu.uKeyLightTop.value.set(keyTopX, keyTopY, 2.85);
    bu.uKeyLightBottom.value.set(keyBotX, keyBotY, 2.75);

    // 直接读取缓存的右侧登录器 UV 边界，避免每帧 getBoundingClientRect 强制同步回流
    const cRect = consoleRectRef.current;
    const consoleMinXUv = cRect.x;
    const consoleMinYUv = cRect.y;
    const consoleMaxXUv = cRect.z;
    const consoleMaxYUv = cRect.w;

    const consoleLeftWorldX = (consoleMinXUv - 0.5) * vWidth;
    const consoleTopWorldY = (consoleMaxYUv - 0.5) * vHeight;
    const consoleBotWorldY = (consoleMinYUv - 0.5) * vHeight;

    // 更新 3D 落樱粒子风洞 InstancedMesh（100% 从屏幕外左上角顺着斜射丁达尔光束飘入画面内）
    let nearConsolePetalEnergy = 0;
    if (petalInstancedRef.current) {
      petalInstancedRef.current.count = targetPetalCount;

      const states = petalStatesRef.current;
      const speedFactor =
        (0.42 + 0.48 * Math.max(windStr, 0.25)) *
        Math.max(settings.rotationSpeed, 0.15);

      const bottomBoundWorldY = -0.62 * vHeight;
      const rightBoundWorldX = 0.58 * vWidth;

      for (let i = 0; i < targetPetalCount; i++) {
        const p = states[i];
        p.age += clampedDelta * speedFactor;

        const spawnWorldX = (p.spawnNormX - 0.5) * vWidth;
        const spawnWorldY = (p.spawnNormY - 0.5) * vHeight;

        if (!p.initialized) {
          p.initialized = true;
          // 首帧按各自的初始 age 沿左上 -> 右下轨迹均匀铺开，形成完整自然的落樱雨长廊
          p.worldPos.set(
            spawnWorldX + p.velocity.x * p.age * 1.15,
            spawnWorldY + p.velocity.y * p.age * 1.05,
            p.spawnZ
          );
        } else if (
          p.age >= p.lifeSpan ||
          p.worldPos.y < bottomBoundWorldY ||
          p.worldPos.x > rightBoundWorldX
        ) {
          // 飞出画面底部/右侧或生命周期结束时，重置回屏幕外左上角起点重新顺光束飘入画面
          p.age = 0;
          p.worldPos.set(spawnWorldX, spawnWorldY, p.spawnZ);
        }

        const lifeRatio = p.age / p.lifeSpan;
        // 连续空间 S 形微风流线 + 落叶钟摆滑翔与波峰悬停升力（Pendulum Swoop & Buoyant Hover）：
        // 花瓣横向荡开到极值时产生空气升力，下落略微放缓并轻盈上扬，随后顺着下一道弧线飘落，彻底告别直线匀速坠落
        const pendulumPhase = realTime * p.flutterFreq * 0.72 + p.flutterPhase;
        const ribbonPhase =
          p.worldPos.y * 0.58 - p.worldPos.x * 0.42 - realTime * 0.85 + p.flutterPhase;
        const gust =
          0.78 +
          0.42 * gustEnvelope +
          0.26 * Math.sin(ribbonPhase) * Math.cos(realTime * 0.75 + p.flutterPhase * 0.5);

        const pendulumSwayVx = Math.sin(pendulumPhase) * 0.52;
        const ribbonCurlVx = Math.cos(ribbonPhase) * 0.34;
        const pendulumHoverLiftVy =
          Math.sin(pendulumPhase * 2.0 + 0.4) * 0.32 +
          Math.sin(ribbonPhase * 0.85) * 0.24;

        const vx = p.velocity.x * gust + pendulumSwayVx + ribbonCurlVx;
        const vy = p.velocity.y * (0.86 - 0.14 * gustEnvelope) + pendulumHoverLiftVy;
        const vz =
          p.velocity.z +
          Math.sin(pendulumPhase * 0.9 + ribbonPhase * 0.5) * 0.22;

        p.worldPos.x += vx * clampedDelta * speedFactor * 1.15;
        p.worldPos.y += vy * clampedDelta * speedFactor * 1.02;
        p.worldPos.z += vz * clampedDelta * speedFactor;

        const distToConsoleLeft = consoleLeftWorldX - p.worldPos.x;
        if (
          distToConsoleLeft > -0.45 &&
          distToConsoleLeft < 0.85 &&
          p.worldPos.y > consoleBotWorldY - 0.3 &&
          p.worldPos.y < consoleTopWorldY + 0.45
        ) {
          const proximity = 1.0 - Math.abs(distToConsoleLeft - 0.15) / 0.7;
          nearConsolePetalEnergy += Math.max(0, proximity);
          if (distToConsoleLeft < 0.25) {
            p.worldPos.x -= clampedDelta * 0.65 * speedFactor;
            p.worldPos.y += clampedDelta * 0.35 * speedFactor;
            p.rotEuler.z += clampedDelta * 1.6;
          }
        }

        // 因为从屏幕左上角画外出生，进入屏幕时已经是饱满尺寸，仅在远端末尾平滑消隐
        const fadeOut = 1.0 - MathUtils.smoothstep(lifeRatio, 0.78, 1.0);
        const s = p.scale * petalSizeMult * baseScale * fadeOut;

        // 随风倾侧摇曳姿态：花瓣滚转角与俯仰角跟随钟摆滑翔节奏轻柔翻转
        p.rotEuler.x +=
          (p.rotSpeed.x * 0.55 + Math.sin(pendulumPhase) * 0.85) *
          clampedDelta *
          speedFactor;
        p.rotEuler.y +=
          (p.rotSpeed.y * 0.50 + Math.cos(ribbonPhase) * 0.65) *
          clampedDelta *
          speedFactor;
        p.rotEuler.z +=
          (p.rotSpeed.z * 0.45 - Math.cos(pendulumPhase) * 0.95) *
          clampedDelta *
          speedFactor;

        dummyObj.position.copy(p.worldPos);
        dummyObj.rotation.copy(p.rotEuler);
        dummyObj.scale.setScalar(Math.max(s, 0.001));
        dummyObj.updateMatrix();
        petalInstancedRef.current.setMatrixAt(i, dummyObj.matrix);
      }
      petalInstancedRef.current.instanceMatrix.needsUpdate = true;
    }

    // 渲染离屏 3D 河津樱与落樱风洞至高清采样缓冲与 64x64 零重影高斯光晕缓冲
    const prevTarget = state.gl.getRenderTarget();
    const prevClearAlpha = state.gl.getClearAlpha();
    state.gl.setClearColor("#000000", 0);

    state.gl.setRenderTarget(renderTarget);
    state.gl.clear(true, true, false);
    state.gl.render(offscreenScene, offscreenCamera);

    state.gl.setRenderTarget(glowTarget);
    state.gl.clear(true, true, false);
    state.gl.render(offscreenScene, offscreenCamera);

    state.gl.setRenderTarget(prevTarget);
    state.gl.setClearAlpha(prevClearAlpha);

    // 更新全屏植物学 ASCII 矩阵 Shader Uniforms
    if (postMatRef.current) {
      const u = postMatRef.current.uniforms;
      u.uTime.value = realTime;
      u.uResolution.value.set(size.width, size.height);
      u.uFocusCenter.value.set(focusNormX, focusNormY);
      u.uSceneTex.value = renderTarget.texture;
      u.uGlowTex.value = glowTarget.texture;
      u.uGridRows.value = settings.gridRows;
      u.uCharScale.value = settings.charScale;
      u.uCellGap.value = settings.cellGap;
      u.uStrokeBoldness.value = settings.strokeBoldness;
      u.uGlowIntensity.value = settings.glowIntensity;
      u.uCoreBrightness.value = settings.coreBrightness;
      u.uHaloSpread.value = settings.haloSpread;
      u.uCrtGridOpacity.value = settings.crtGridOpacity;
      u.uBgBeamIntensity.value = settings.bgBeamIntensity;
      u.uConsoleBounceIntensity.value = settings.consoleBounceIntensity;
      u.uConsoleBounceSpread.value = settings.consoleBounceSpread;
      u.uHorizGlitch.value = settings.horizGlitch;
      u.uWindStrength.value = windStr;
      u.uPetalBouncePulse.value = MathUtils.clamp(
        0.45 * (targetPetalCount / 14.0) + nearConsolePetalEnergy * 0.25,
        0.0,
        1.75
      );
      u.uConsoleRect.value.set(
        consoleMinXUv,
        consoleMinYUv,
        consoleMaxXUv,
        consoleMaxYUv
      );
    }
  });

  return (
    <>
      {createPortal(
        <>
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[-4.5, 5.5, 4.0]}
            intensity={2.4}
            color="#fff5f8"
          />
          <directionalLight
            position={[5.0, -3.5, 3.0]}
            intensity={1.35}
            color="#ffd6e7"
          />

          {/* 河津樱主花枝（带连续风场摇曳与 48 簇 Voronoi 花瓣呼吸解构） */}
          <group ref={sakuraHolderRef}>
            <mesh
              geometry={branchGeometry}
              material={branchShaderMaterial}
            />
          </group>

          {/* 3D 落樱粒子风洞（从枝头实时剥离飘向右侧拟物登录器） */}
          <instancedMesh
            ref={petalInstancedRef}
            args={[petalGeometry, petalMaterial, MAX_PETAL_INSTANCES]}
            frustumCulled={false}
          />
        </>,
        offscreenScene
      )}

      {/* 全屏正交输出平面：执行植物形态符号学 ASCII 矩阵转换 */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <shaderMaterial
          ref={postMatRef}
          vertexShader={sakuraAsciiVertexShader}
          fragmentShader={sakuraAsciiFragmentShader}
          uniforms={uniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}

useGLTF.preload(SAKURA_GLB_URL);

export function SakuraAsciiHeroCanvas({
  onReady,
  settings = DEFAULT_ASCII_ART_SETTINGS,
}: {
  onReady?: () => void;
  settings?: AsciiArtSettings;
}) {
  const [renderMode, setRenderMode] = useState<"full" | "basic" | "static">(
    "full"
  );

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
    });
  }, []);

  const handleCanvasError = useCallback((error: Error) => {
    console.warn("[login-sakura-ascii] WebGL failed, falling back:", error);
    setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
  }, []);

  if (renderMode === "static") {
    return <StaticSakuraFallback onReady={onReady} />;
  }

  return (
    <AsciiErrorBoundary
      key={renderMode}
      fallback={<StaticSakuraFallback onReady={onReady} />}
      onError={handleCanvasError}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 100 }}
        dpr={renderMode === "basic" ? 1 : [1, 1.75]}
        resize={{ offsetSize: true }}
        gl={{
          antialias: renderMode === "full",
          alpha: false,
          powerPreference:
            renderMode === "full" ? "high-performance" : "default",
        }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: "#000000",
        }}
        onCreated={handleCreated}
      >
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          <SakuraAsciiPipeline onReady={onReady} settings={settings} />
        </Suspense>
        {renderMode === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom
              intensity={1.15 * (settings.glowIntensity / 2.6)}
              luminanceThreshold={0.46}
              luminanceSmoothing={0.32}
              radius={0.44}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </AsciiErrorBoundary>
  );
}
