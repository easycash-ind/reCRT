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
  vanitasAsciiFragmentShader,
  vanitasAsciiVertexShader,
  vanitasBranchFragmentShader,
  vanitasBranchVertexShader,
} from "./vanitasAsciiShaders";

export interface VanitasSpecimenInfo {
  id: string;
  code: string;
  latinName: string;
  jpName: string;
  cnName: string;
  url: string;
  speciesId: number;
  baseScale: number;
  baseRoll: number;
  stardustColorHex: string;
}

export const VANITAS_SPECIMENS: readonly VanitasSpecimenInfo[] = [
  {
    id: "kawazu_sakura",
    code: "01/03",
    latinName: "PRUNUS LANNESIANA",
    jpName: "河津桜",
    cnName: "河津樱",
    url: "/scan-glb/kawazu_sakura_ascii_ready.glb",
    speciesId: 0,
    baseScale: 1.24,
    baseRoll: -0.14,
    stardustColorHex: "#ff78b4",
  },
  {
    id: "mountain_azalea",
    code: "02/03",
    latinName: "RHODODENDRON KAEMPFERI",
    jpName: "山躑躅",
    cnName: "山杜鹃",
    url: "/scan-glb/mountain_azalea_ascii_ready.glb",
    speciesId: 1,
    baseScale: 1.18,
    baseRoll: -0.08,
    stardustColorHex: "#ff6438",
  },
  {
    id: "oomurasaki_azalea",
    code: "03/03",
    latinName: "RHODODENDRON × PULCHRUM",
    jpName: "大紫躑躅",
    cnName: "大紫杜鹃",
    url: "/scan-glb/oomurasaki_azalea_ascii_ready.glb",
    speciesId: 2,
    baseScale: 1.18,
    baseRoll: -0.10,
    stardustColorHex: "#c45aff",
  },
];

export type VanitasPhaseLabel =
  | "I. GENESIS [春·星尘凝聚]"
  | "II. FLOURISH [夏·盛放沐光]"
  | "III. EROSION [秋·熵增风化]"
  | "IV. REBIRTH [冬·星尘轮回]";

export interface VanitasTelemetry {
  specimen: VanitasSpecimenInfo;
  phaseLabel: VanitasPhaseLabel;
  cycleProgress: number;
}

const MAX_STARDUST_INSTANCES = 56;
const VANITAS_CYCLE_DURATION = 11.2;
const ASIN_NORM = Math.asin(0.98);

function evaluateRodWavelet(
  tau: number,
  amp: number,
  decayRate: number,
  freq: number
): number {
  if (tau <= 0.0 || tau >= 14.0) return 0.0;
  const onset = 0.5 * (1.0 - Math.cos(Math.PI * Math.min(tau / 0.42, 1.0)));
  const tailWindow =
    tau > 11.0 ? Math.pow(1.0 - (tau - 11.0) / 3.0, 2.0) : 1.0;
  const decay = Math.exp(-decayRate * tau);
  const carrier = Math.asin(0.98 * Math.sin(freq * tau - 0.35)) / ASIN_NORM;
  return -amp * onset * decay * tailWindow * carrier;
}

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
  const safeT = t + GUST_CYCLE_DURATION * 2.0;
  const currentCycleIdx = Math.floor(safeT / GUST_CYCLE_DURATION);
  let sum = 0.0;
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

interface StarDustParticleState {
  initialized: boolean;
  age: number;
  lifeSpan: number;
  pos: Vector3;
  vel: Vector3;
  spawnLocal: Vector3;
  streamSeed: number;
  flutterFreq: number;
  flutterAmp: number;
  buoyancy: number;
  scale: number;
  baseRoll: number;
  basePitch: number;
  spinRate: number;
}

function createStarDustStates(): StarDustParticleState[] {
  const states: StarDustParticleState[] = [];
  for (let i = 0; i < MAX_STARDUST_INSTANCES; i++) {
    const golden = (i * 0.61803398875) % 1.0;
    const golden2 = (i * 0.38196601125) % 1.0;
    const crownAngle = i * 2.3999632;
    const crownRad = 0.25 + Math.sqrt(golden) * 1.65;
    const lifeSpan = 5.4 + (i % 7) * 0.68;
    // 兼顾轻盈微尘 (0.40~0.62) 与舒展飘花 (0.72~1.05)，形成丰富的空间纵深层次
    const isFineMote = i % 3 !== 0;
    const scale = isFineMote
      ? 0.38 + (i % 4) * 0.065
      : 0.68 + (i % 4) * 0.095;

    states.push({
      initialized: false,
      age: (golden * lifeSpan) % lifeSpan,
      lifeSpan,
      pos: new Vector3(0, 0, 0),
      vel: new Vector3(0, 0, 0),
      spawnLocal: new Vector3(
        Math.cos(crownAngle) * crownRad * 1.15,
        Math.sin(crownAngle) * crownRad * 0.92 + (golden2 - 0.45) * 0.45,
        ((i % 7) - 3) * 0.24
      ),
      streamSeed: i * 1.73205 + golden * 6.28318,
      flutterFreq: 1.25 + (i % 6) * 0.21,
      flutterAmp: 0.42 + (i % 5) * 0.11,
      buoyancy: -0.18 + golden2 * 0.72,
      scale,
      baseRoll: (i * 1.9) % 6.28,
      basePitch: 0.35 + (i % 5) * 0.14,
      spinRate: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 4) * 0.18),
    });
  }
  return states;
}

/**
 * 营造轻盈灵动的微弧花瓣造型（流线型窄长花瓣，受风倾侧时姿态更飘逸）
 */
function createStarDustChipGeometry(): BufferGeometry {
  const geo = new PlaneGeometry(0.24, 0.36, 4, 5);
  const pos = geo.attributes.position;
  const metaArray = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const vNorm = (y / 0.36) + 0.5;
    const taper = Math.sin(Math.max(0.05, Math.min(0.98, vNorm)) * Math.PI);
    pos.setX(i, x * (0.35 + 0.65 * taper));
    pos.setZ(i, (x * x * 1.4 + Math.sin(vNorm * Math.PI) * 0.06) * 0.36);
    metaArray[i * 4 + 0] = 1.0;
    metaArray[i * 4 + 1] = 1.0;
    metaArray[i * 4 + 2] = 0.5;
    metaArray[i * 4 + 3] = 0.92;
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

function StaticVanitasFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div
        className="absolute left-[30%] top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[76px]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,120,180,0.36) 0%, rgba(196,90,255,0.28) 45%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

function VanitasAsciiPipeline({
  onReady,
  settings,
  onTelemetryChange,
}: {
  onReady?: () => void;
  settings: AsciiArtSettings;
  onTelemetryChange?: (telemetry: VanitasTelemetry) => void;
}) {
  const { gl, size, viewport } = useThree();

  const gltf0 = useGLTF(VANITAS_SPECIMENS[0].url);
  const gltf1 = useGLTF(VANITAS_SPECIMENS[1].url);
  const gltf2 = useGLTF(VANITAS_SPECIMENS[2].url);

  const postMatRef = useRef<ShaderMaterial>(null);
  const holderRef = useRef<Group>(null);
  const stardustRef = useRef<InstancedMesh>(null);

  const mouseTarget = useRef(new Vector2(0, 0));
  const mouseCurrent = useRef(new Vector2(0, 0));
  const reported = useRef(false);
  // 初始时间设为 2.1s（恰好处于春季生长完成、步入盛放的黄金时刻）
  const cycleTimeRef = useRef(2.1);
  const windTimeRef = useRef(0);
  const lastTelemetryStrRef = useRef("");

  const consoleRectRef = useRef(new Vector4(0.68, 0.31, 0.91, 0.72));
  const stardustStatesRef = useRef<StarDustParticleState[]>(
    createStarDustStates()
  );
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

  // 解析三株轮回植物模型的几何体与主纹理
  const parsedSpecimens = useMemo(() => {
    const gltfs = [gltf0, gltf1, gltf2];
    return gltfs.map((g, idx) => {
      let foundGeo: BufferGeometry | null = null;
      let foundTex: Texture | null = null;
      g.scene.traverse((child) => {
        if ((child as Mesh).isMesh) {
          const mesh = child as Mesh;
          const mat = mesh.material as MeshStandardMaterial | undefined;
          if (mat?.map && !foundTex) {
            foundTex = mat.map;
            foundTex.colorSpace = SRGBColorSpace;
            foundTex.needsUpdate = true;
          }
          if (
            !mesh.name.includes("PetalChip") &&
            !mesh.geometry.name.includes("PetalChip") &&
            !foundGeo
          ) {
            const clonedGeo = mesh.geometry.clone();
            // 兼容 _azalea_meta 属性别名，确保所有植物模型 100% 绑定 _sakura_meta 四通道语义属性
            if (
              !clonedGeo.attributes._sakura_meta &&
              clonedGeo.attributes._azalea_meta
            ) {
              clonedGeo.setAttribute(
                "_sakura_meta",
                clonedGeo.attributes._azalea_meta
              );
            }
            foundGeo = clonedGeo;
          }
        }
      });

      const shaderMat = new ShaderMaterial({
        vertexShader: vanitasBranchVertexShader,
        fragmentShader: vanitasBranchFragmentShader,
        uniforms: {
          uMap: { value: foundTex },
          uTime: { value: 0 },
          uWindStrength: { value: settings.windStrength ?? 1.0 },
          uGrowthProgress: { value: 1.0 },
          uEntropyDecay: { value: 0.0 },
          uEntropyIntensity: { value: settings.entropyIntensity ?? 1.0 },
          uGenesisGlow: { value: settings.genesisGlow ?? 1.0 },
          uSpeciesId: { value: VANITAS_SPECIMENS[idx].speciesId },
          uRoughness: { value: settings.roughness },
          uBranchSpringAngles: { value: new Vector3(0, 0, 0) },
          uKeyLightTop: { value: new Vector3(0, 2, 3) },
          uKeyLightBottom: { value: new Vector3(0, -2, 3) },
        },
        side: DoubleSide,
      });

      return {
        info: VANITAS_SPECIMENS[idx],
        geometry: foundGeo ?? new PlaneGeometry(3, 3),
        material: shaderMat,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf0.scene, gltf1.scene, gltf2.scene]);

  const stardustGeometry = useMemo(() => createStarDustChipGeometry(), []);
  const stardustMaterial = useMemo(() => {
    return new MeshStandardMaterial({
      color: new Color(1.0, 0.56, 0.82),
      emissive: new Color(1.0, 0.44, 0.74),
      emissiveIntensity: 0.36,
      roughness: 0.58,
      metalness: 0.02,
      side: DoubleSide,
    });
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
    const cycleSpeed = settings.vanitasCycleSpeed ?? 1.0;
    cycleTimeRef.current += clampedDelta * cycleSpeed;
    windTimeRef.current += clampedDelta * settings.rotationSpeed;

    const cycleElapsed = cycleTimeRef.current;
    const windElapsed = windTimeRef.current;
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

    // 计算当前处于第几个物种轮回周期以及周期内的四季进度 cyclePhase ∈ [0, 1)
    const totalCycles = cycleElapsed / VANITAS_CYCLE_DURATION;
    const lockMode = Math.round(settings.vanitasSpeciesLock ?? 0);
    const activeSpeciesIdx =
      lockMode >= 1 && lockMode <= parsedSpecimens.length
        ? lockMode - 1
        : ((Math.floor(totalCycles) % parsedSpecimens.length) +
            parsedSpecimens.length) %
          parsedSpecimens.length;
    const cyclePhase = totalCycles - Math.floor(totalCycles);
    const activeSpec = parsedSpecimens[activeSpeciesIdx];

    // 四阶段「赛博枯荣循环」状态曲线：
    // Phase I   (0.00 ~ 0.22): 春·星尘内聚与测地线生长 (growthProgress: 0 -> 1, entropyDecay: 0)
    // Phase II  (0.22 ~ 0.64): 夏·盛放沐光与长尾微风 (growthProgress: 1, entropyDecay: 0)
    // Phase III (0.64 ~ 0.88): 秋·由外向内熵增风化剥离 (growthProgress: 1, entropyDecay: 0 -> 0.85)
    // Phase IV  (0.88 ~ 1.00): 冬·星尘湮灭与跨物种轮回脉冲 (entropyDecay: 0.85 -> 1.0, glitchPulse 激发)
    const growthProgress = MathUtils.smoothstep(cyclePhase, 0.0, 0.22);
    const entropyDecay = MathUtils.smoothstep(cyclePhase, 0.64, 0.96);

    // 在冬春交接（0.90 ~ 1.00 及 0.00 ~ 0.06）瞬间触发柔和的横向扫描破形脉冲
    const winterGlitchSpike =
      MathUtils.smoothstep(cyclePhase, 0.88, 0.96) *
        (1.0 - MathUtils.smoothstep(cyclePhase, 0.96, 1.0)) +
      (1.0 - MathUtils.smoothstep(cyclePhase, 0.0, 0.06)) * 0.65;

    let phaseLabel: VanitasPhaseLabel = "II. FLOURISH [夏·盛放沐光]";
    if (cyclePhase < 0.22) {
      phaseLabel = "I. GENESIS [春·星尘凝聚]";
    } else if (cyclePhase < 0.64) {
      phaseLabel = "II. FLOURISH [夏·盛放沐光]";
    } else if (cyclePhase < 0.88) {
      phaseLabel = "III. EROSION [秋·熵增风化]";
    } else {
      phaseLabel = "IV. REBIRTH [冬·星尘轮回]";
    }

    if (onTelemetryChange) {
      const key = `${activeSpec.info.id}-${phaseLabel}`;
      if (key !== lastTelemetryStrRef.current) {
        lastTelemetryStrRef.current = key;
        onTelemetryChange({
          specimen: activeSpec.info,
          phaseLabel,
          cycleProgress: cyclePhase,
        });
      }
    }

    const isDesktop = size.width >= 900;
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
    const entropyInt = settings.entropyIntensity ?? 1.0;
    const genesisGlow = settings.genesisGlow ?? 1.0;
    const modelScale = settings.modelScale ?? 1.0;
    const tiltAmt = settings.tiltRandomness ?? 0.65;

    // 长杆子长尾阻尼谐振微风摆动
    const primarySwayXY =
      evaluateLongTailBranchRod(windElapsed, 0.42, 4.25) * 0.048 * windStr;
    const tipFollowXY =
      evaluateLongTailBranchRod(windElapsed - 0.18, 0.33, 4.25) * 0.044 * windStr;
    const primarySwayXZ =
      evaluateLongTailBranchRod(windElapsed - 0.10, 0.38, 3.85) * 0.026 * windStr;

    const basePitch = 0.06 + (tiltAmt - 0.65) * 0.12 + mouseCurrent.current.y * 0.05;
    const baseYaw = 0.08 + mouseCurrent.current.x * 0.06;
    const baseRoll = activeSpec.info.baseRoll;
    const baseScale =
      (isDesktop ? activeSpec.info.baseScale : activeSpec.info.baseScale * 0.72) *
      modelScale;

    if (holderRef.current) {
      holderRef.current.position.set(worldX, worldY, 0);
      holderRef.current.rotation.set(basePitch, baseYaw, baseRoll);
      holderRef.current.scale.set(
        baseScale,
        baseScale,
        baseScale * MathUtils.lerp(0.75, 1.15, settings.extrudeScale * 0.5)
      );
      holderRef.current.updateMatrixWorld();

      holderRef.current.children.forEach((child, idx) => {
        child.visible = idx === activeSpeciesIdx;
      });
    }

    const lightSpan = 0.85 + 0.35 * modelScale;
    const keyTopX = focusWorldX - 0.65 * lightSpan + Math.sin(realTime * 0.7) * 0.18;
    const keyTopY = focusWorldY + 1.15 * lightSpan + Math.cos(realTime * 0.5) * 0.15;
    const keyBotX = focusWorldX + 0.55 * lightSpan;
    const keyBotY = focusWorldY - 0.95 * lightSpan;

    // 更新当前激活物种的 Shader Uniforms
    const bu = activeSpec.material.uniforms;
    bu.uTime.value = realTime;
    bu.uWindStrength.value = windStr;
    bu.uGrowthProgress.value = growthProgress;
    bu.uEntropyDecay.value = entropyDecay;
    bu.uEntropyIntensity.value = entropyInt;
    bu.uGenesisGlow.value = genesisGlow;
    bu.uRoughness.value = settings.roughness;
    bu.uBranchSpringAngles.value.set(primarySwayXY, tipFollowXY, primarySwayXZ);
    bu.uKeyLightTop.value.set(keyTopX, keyTopY, 2.85);
    bu.uKeyLightBottom.value.set(keyBotX, keyBotY, 2.75);

    // 同步星尘粒子材质颜色至当前轮回物种的代表色相
    stardustMaterial.color.set(activeSpec.info.stardustColorHex);
    stardustMaterial.emissive.set(activeSpec.info.stardustColorHex);

    // 更新连续丝滑旋度流场粒子系统 (Continuous Curl-Stream & Pendulum Glide Field)：
    // 彻底摒弃分阶段坐标瞬移与机械圆周轨道，采用带空气阻尼惯性的 3D 旋度流场积分 + 落叶钟摆滑翔升力：
    // - 花瓣/星尘在横向滑翔波峰处自然减速上扬（微悬停），随后顺着 S 形柔风流线轻盈滑入下一道弧线！
    const basePetalSetting = settings.petalCount ?? 14;
    const targetCount = Math.round(
      MathUtils.clamp(basePetalSetting * 1.85, 0, MAX_STARDUST_INSTANCES)
    );
    const petalSizeMult = settings.petalSize ?? 1.2;

    if (stardustRef.current) {
      stardustRef.current.count = targetCount;
      const states = stardustStatesRef.current;
      const flowSpeedMult =
        (0.55 + 0.45 * Math.max(windStr, 0.25)) *
        (0.75 + 0.45 * entropyDecay * entropyInt);

      const gustDriftX = Math.max(0.0, -primarySwayXY * 6.5);
      const gustLiftY = primarySwayXY * 3.8;

      for (let i = 0; i < targetCount; i++) {
        const p = states[i];
        p.age += clampedDelta * flowSpeedMult * (0.82 + (i % 5) * 0.08);

        const spawnX = focusWorldX + p.spawnLocal.x * (0.78 + 0.25 * modelScale);
        const spawnY = focusWorldY + p.spawnLocal.y * (0.78 + 0.25 * modelScale);
        const spawnZ = p.spawnLocal.z;

        if (!p.initialized) {
          p.initialized = true;
          // 首帧按各自的初始 age 沿 S 形风场自然散开，避免扎堆出生
          const initT = p.age;
          const initWave = Math.sin(initT * 0.9 + p.streamSeed);
          p.pos.set(
            spawnX + initT * 0.48 + initWave * 0.45,
            spawnY + initT * p.buoyancy * 0.42 + Math.cos(initT * 0.75 + p.streamSeed) * 0.35,
            spawnZ
          );
          p.vel.set(0.52, p.buoyancy * 0.35, 0);
        } else if (
          p.age >= p.lifeSpan ||
          p.pos.x > vWidth * 0.56 ||
          p.pos.y > vHeight * 0.62 ||
          p.pos.y < -vHeight * 0.62
        ) {
          p.age = 0;
          // 春季凝聚期：新粒子从左上方柔光带与花冠外围丝滑汇入；
          // 夏秋盛放与风化期：新粒子直接从花冠外缘花瓣尖端轻柔剥离飘出！
          if (cyclePhase < 0.22) {
            p.pos.set(
              spawnX - 1.35 - (i % 4) * 0.28,
              spawnY + 0.95 + ((i % 5) - 2) * 0.32,
              spawnZ
            );
            p.vel.set(0.68, -0.32, 0);
          } else {
            p.pos.set(spawnX, spawnY, spawnZ);
            p.vel.set(
              0.28 + Math.cos(p.streamSeed) * 0.18,
              0.12 + p.buoyancy * 0.25,
              0
            );
          }
        }

        const lifeRatio = MathUtils.clamp(p.age / p.lifeSpan, 0.0, 1.0);

        // 1. 连续空间 3D 旋度流场 (Divergence-Free Silk Curl Stream)：
        //    粒子随所在空间位置 (pos.x, pos.y) 沿着蜿蜒的 S 形流线舒展游走
        const sPhase1 =
          p.pos.x * 0.62 - p.pos.y * 0.48 - realTime * 0.92 + p.streamSeed;
        const sPhase2 =
          p.pos.y * 0.78 + p.pos.x * 0.36 - realTime * 0.68 + p.streamSeed * 1.618;

        const curlVx =
          Math.sin(sPhase1) * 0.48 + Math.cos(sPhase2) * 0.32;
        const curlVy =
          Math.cos(sPhase1 * 0.85) * 0.44 + Math.sin(sPhase2) * 0.28;
        const curlVz = Math.sin(sPhase1 + sPhase2) * 0.22;

        // 2. 花瓣空气动力学“钟摆滑翔与波峰悬停升力” (Pendulum Glide & Hover-Lift)：
        //    模拟真实花瓣/羽绒在空中左右摆动滑翔：横向滑行到极值点时，迎风倾角产生向上浮力，实现轻盈的波峰微悬停！
        const pendulumAngle = realTime * p.flutterFreq + p.streamSeed;
        const pendulumSwayVx = Math.sin(pendulumAngle) * p.flutterAmp;
        const pendulumHoverLiftVy =
          Math.sin(pendulumAngle * 2.0 + 0.45) * p.flutterAmp * 0.58;

        // 3. 四季平滑导向气流（全程连续混合，零阶跃突变）：
        //    春季引向花枝中心凝聚，夏季顺左上光束斜飘，秋冬乘着反重力暖流向右上蜿蜒升腾
        const springPullWeight =
          (1.0 - MathUtils.smoothstep(cyclePhase, 0.06, 0.26)) *
          (1.0 - lifeRatio * 0.5);
        const autumnAscendWeight = MathUtils.smoothstep(cyclePhase, 0.54, 0.82);

        const toCenterX = (focusWorldX - p.pos.x) * 0.65;
        const toCenterY = (focusWorldY - p.pos.y) * 0.65;

        const baseFlowVx = MathUtils.lerp(
          0.62 + gustDriftX,
          0.96 * entropyInt + gustDriftX,
          autumnAscendWeight
        );
        const baseFlowVy = MathUtils.lerp(
          -0.28 + p.buoyancy * 0.45 + gustLiftY,
          0.46 * entropyInt + p.buoyancy * 0.55 + gustLiftY,
          autumnAscendWeight
        );

        const targetVx =
          MathUtils.lerp(baseFlowVx, toCenterX, springPullWeight) +
          curlVx +
          pendulumSwayVx;
        const targetVy =
          MathUtils.lerp(baseFlowVy, toCenterY, springPullWeight) +
          curlVy +
          pendulumHoverLiftVy;
        const targetVz = curlVz;

        // 4. 低阻尼空气惯性平滑积分：让速度方向如丝绸般顺滑偏转，彻底告别僵硬折线与机械圆圈
        const inertiaLerp = Math.min(clampedDelta * 2.4, 0.35);
        p.vel.x = MathUtils.lerp(p.vel.x, targetVx, inertiaLerp);
        p.vel.y = MathUtils.lerp(p.vel.y, targetVy, inertiaLerp);
        p.vel.z = MathUtils.lerp(p.vel.z, targetVz, inertiaLerp);

        p.pos.x += p.vel.x * clampedDelta * flowSpeedMult;
        p.pos.y += p.vel.y * clampedDelta * flowSpeedMult;
        p.pos.z += p.vel.z * clampedDelta * flowSpeedMult;

        // 5. 随风倾侧姿态 (Aerodynamic Banking Orientation)：
        //    花瓣倾角跟随钟摆滑翔速度与升力自然翻转摇曳，而非机械匀速自转
        const bankRoll =
          p.baseRoll +
          realTime * p.spinRate +
          Math.cos(pendulumAngle) * 0.68 -
          p.vel.x * 0.25;
        const bankPitch =
          p.basePitch +
          Math.sin(pendulumAngle * 0.85) * 0.52 +
          p.vel.y * 0.28;
        const bankYaw =
          Math.sin(sPhase1 * 0.7) * 0.65 + realTime * p.spinRate * 0.6;

        // 6. 呼吸闪烁与首尾丝滑渐隐包络
        const fadeIn = MathUtils.smoothstep(lifeRatio, 0.0, 0.18);
        const fadeOut = 1.0 - MathUtils.smoothstep(lifeRatio, 0.64, 1.0);
        const twinkle =
          0.78 + 0.22 * Math.sin(realTime * 3.2 + p.streamSeed * 2.3);
        const scaleVis = fadeIn * fadeOut * twinkle;

        const finalScale =
          p.scale * petalSizeMult * baseScale * Math.max(scaleVis, 0.001);
        dummyObj.position.copy(p.pos);
        dummyObj.rotation.set(bankPitch, bankYaw, bankRoll);
        dummyObj.scale.setScalar(finalScale);
        dummyObj.updateMatrix();
        stardustRef.current.setMatrixAt(i, dummyObj.matrix);
      }
      stardustRef.current.instanceMatrix.needsUpdate = true;
    }

    // 渲染离屏 3D 舞台
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

    // 更新全屏 ASCII 矩阵 Shader Uniforms
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
      // 在冬春轮回交接瞬间叠加熵增扫描破形脉冲
      u.uHorizGlitch.value =
        settings.horizGlitch + winterGlitchSpike * 0.85 * entropyInt;
      u.uWindStrength.value = windStr;
      u.uPetalBouncePulse.value = MathUtils.clamp(
        0.55 + entropyDecay * 0.85,
        0.2,
        1.75
      );
      u.uConsoleRect.value.copy(consoleRectRef.current);
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

          <group ref={holderRef}>
            {parsedSpecimens.map((spec, idx) => (
              <mesh
                key={spec.info.id}
                geometry={spec.geometry}
                material={spec.material}
                visible={idx === 0}
              />
            ))}
          </group>

          <instancedMesh
            ref={stardustRef}
            args={[stardustGeometry, stardustMaterial, MAX_STARDUST_INSTANCES]}
            frustumCulled={false}
          />
        </>,
        offscreenScene
      )}

      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <shaderMaterial
          ref={postMatRef}
          vertexShader={vanitasAsciiVertexShader}
          fragmentShader={vanitasAsciiFragmentShader}
          uniforms={uniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}

VANITAS_SPECIMENS.forEach((s) => useGLTF.preload(s.url));

export function VanitasAsciiHeroCanvas({
  onReady,
  settings = DEFAULT_ASCII_ART_SETTINGS,
  onTelemetryChange,
}: {
  onReady?: () => void;
  settings?: AsciiArtSettings;
  onTelemetryChange?: (telemetry: VanitasTelemetry) => void;
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
    console.warn("[login-vanitas-ascii] WebGL failed, falling back:", error);
    setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
  }, []);

  if (renderMode === "static") {
    return <StaticVanitasFallback onReady={onReady} />;
  }

  return (
    <AsciiErrorBoundary
      key={renderMode}
      fallback={<StaticVanitasFallback onReady={onReady} />}
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
          <VanitasAsciiPipeline
            onReady={onReady}
            settings={settings}
            onTelemetryChange={onTelemetryChange}
          />
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
