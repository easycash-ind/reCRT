import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CITY_POP_PALETTE,
  ROAD_CONFIG,
  sampleRoad,
} from "./highwayCurve";
import {
  CITYPOP_FADE_UNIFORMS,
  CITYPOP_THEME_UNIFORMS,
  createCityPopOceanMaterial,
} from "./cityPopShaders";
import { DeLoreanCar } from "./DeLoreanCar";
import { ProceduralCoastline } from "./ProceduralCoastline";
import { CityPopSkyAndOcean } from "./CityPopSkyAndOcean";
import { OncomingTraffic } from "./OncomingTraffic";

export type CameraViewMode = "chase" | "front" | "cockpit";
export type DrivingLane = "right" | "left";

export interface CityPopHighwaySceneConfig {
  cameraMode: CameraViewMode;
  lane: DrivingLane;
  /** 巡航速度 km/h (默认 118 km/h) */
  speedKmh: number;
  /** 海岸随机种子 */
  seed: number;
  /** 时段氛围 */
  timeOfDay: "noon" | "sunset";
}

interface HighwayControllerProps {
  config: CityPopHighwaySceneConfig;
  onReady?: () => void;
  onTelemetryUpdate?: (zMeters: number) => void;
}

function HighwayWorldController({
  config,
  onReady,
  onTelemetryUpdate,
}: HighwayControllerProps) {
  const { camera } = useThree();

  const carGroupRef = useRef<THREE.Group>(null);
  const carZRef = useRef(0);
  const currentChunkRef = useRef(0);
  const [currentChunk, setCurrentChunk] = useState(0);

  // 共享海湾波光 ShaderMaterial
  const oceanMaterial = useMemo(() => createCityPopOceanMaterial(), []);

  // 当前横向车道偏移（平滑插值）
  const currentLateralRef = useRef<number>(ROAD_CONFIG.rightLaneOffset);
  const steerAngleRef = useRef<number>(0);

  // 鼠标平滑环视偏移
  const pointerRef = useRef({ x: 0, y: 0 });
  const smoothedLookRef = useRef({ x: 0, y: 0 });

  // 360° 环绕检视与推拉缩放状态（支持 macOS 双指触控板滑动/捏合、鼠标拖拽/滚轮、触屏滑动/捏合，松手维持当前视角不自动回正）
  const orbitTargetRef = useRef({ yaw: 0, pitch: 0 });
  const orbitCurrentRef = useRef({ yaw: 0, pitch: 0 });
  const orbitMixRef = useRef(0);
  const chaseRadiusTargetRef = useRef(6.35);
  const chaseRadiusCurrentRef = useRef(6.35);
  const cockpitFovTargetRef = useRef(64);
  const cockpitFovCurrentRef = useRef(64);
  const cameraModeRef = useRef(config.cameraMode);
  cameraModeRef.current = config.cameraMode;

  // 相机平滑过渡进度 (cockpitBlend: 0 = 外部视角, 1 = 车内驾驶室; frontBlend: 0 = 车尾追尾, 1 = 车头回看镜像视角)
  const cockpitBlendRef = useRef(config.cameraMode === "cockpit" ? 1 : 0);
  const frontBlendRef = useRef(config.cameraMode === "front" ? 1 : 0);

  // 切换机位模式时重置环绕偏移与缩放至该机位默认值
  useEffect(() => {
    orbitTargetRef.current = { yaw: 0, pitch: 0 };
    chaseRadiusTargetRef.current = 6.35;
    cockpitFovTargetRef.current = 64;
  }, [config.cameraMode]);

  // 车内驾驶员摄像机高度（默认 1.135m，支持 Q / E 键实时连续升降调节）
  const cockpitHeightRef = useRef(1.135);
  const heightKeysRef = useRef({ q: false, e: false });

  useEffect(() => {
    let isPointerDragging = false;
    let lastDragPos = { x: 0, y: 0 };
    let lastTouchPos: { x: number; y: number } | null = null;
    let lastPinchDist: number | null = null;

    const applyZoomDelta = (delta: number) => {
      if (cameraModeRef.current === "cockpit") {
        cockpitFovTargetRef.current = THREE.MathUtils.clamp(
          cockpitFovTargetRef.current + delta * 0.12,
          28,
          92
        );
      } else {
        chaseRadiusTargetRef.current = THREE.MathUtils.clamp(
          chaseRadiusTargetRef.current + delta * 0.018,
          2.6,
          16.0
        );
      }
    };

    // 1. macOS 双指捏合缩放 / 鼠标滚轮推拉 + macOS 双指触控板滑动环绕
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, a")) return;

      e.preventDefault();

      // macOS 双指捏合在浏览器中表现为 ctrlKey === true 的 wheel 事件
      if (e.ctrlKey) {
        applyZoomDelta(e.deltaY * 3.2);
        return;
      }

      // 传统鼠标滚轮（deltaX === 0 且按行或较大步进滚动）用于推拉摄像机
      const isMouseWheelOnlyY =
        Math.abs(e.deltaX) < 0.01 &&
        (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 40);

      if (isMouseWheelOnlyY) {
        const lineScale = e.deltaMode !== 0 ? 32 : 1;
        applyZoomDelta(e.deltaY * lineScale * 0.35);
        return;
      }

      // 触控板双指滑动用于环绕旋转视角，停止后维持当前角度
      orbitTargetRef.current.yaw -= e.deltaX * 0.0085;
      orbitTargetRef.current.pitch = THREE.MathUtils.clamp(
        orbitTargetRef.current.pitch + e.deltaY * 0.0055,
        -1.25,
        1.25
      );
    };

    // Safari 触控板原生双指捏合手势兜底
    let lastGestureScale = 1;
    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      lastGestureScale = (e as unknown as { scale?: number }).scale ?? 1;
    };
    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as unknown as { scale?: number }).scale ?? 1;
      const diff = lastGestureScale - scale;
      lastGestureScale = scale;
      applyZoomDelta(diff * 180);
    };

    // 2. 桌面端鼠标按住拖拽环绕检视（松开后维持当前角度不回正）
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, a")) return;
      if (e.pointerType === "mouse" && (e.button === 0 || e.button === 2)) {
        isPointerDragging = true;
        lastDragPos = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      pointerRef.current = { x: nx, y: ny };

      if (isPointerDragging) {
        const dx = e.clientX - lastDragPos.x;
        const dy = e.clientY - lastDragPos.y;
        lastDragPos = { x: e.clientX, y: e.clientY };
        orbitTargetRef.current.yaw -= dx * 0.0095;
        orbitTargetRef.current.pitch = THREE.MathUtils.clamp(
          orbitTargetRef.current.pitch + dy * 0.0065,
          -1.25,
          1.25
        );
      }
    };

    const handlePointerUp = () => {
      isPointerDragging = false;
    };

    // 3. 触控屏单指滑动环绕 & 双指捏合推拉（松手维持当前角度不回正）
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, input, a")) return;
      if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        lastTouchPos = null;
      } else if (e.touches.length === 1) {
        lastPinchDist = null;
        lastTouchPos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDist !== null) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = lastPinchDist - dist;
        lastPinchDist = dist;
        applyZoomDelta(delta * 0.9);
        return;
      }
      if (!lastTouchPos || e.touches.length === 0) return;
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      const dx = tx - lastTouchPos.x;
      const dy = ty - lastTouchPos.y;
      lastTouchPos = { x: tx, y: ty };

      orbitTargetRef.current.yaw -= dx * 0.01;
      orbitTargetRef.current.pitch = THREE.MathUtils.clamp(
        orbitTargetRef.current.pitch + dy * 0.007,
        -1.25,
        1.25
      );
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastPinchDist = null;
      }
      if (e.touches.length === 0) {
        lastTouchPos = null;
      }
    };

    // 4. Q / E 键实时调节车内驾驶员摄像机高度（支持点按步进与长按平滑升降）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "q") {
        heightKeysRef.current.q = true;
        cockpitHeightRef.current = THREE.MathUtils.clamp(
          cockpitHeightRef.current - 0.025,
          0.88,
          1.42
        );
      } else if (k === "e") {
        heightKeysRef.current.e = true;
        cockpitHeightRef.current = THREE.MathUtils.clamp(
          cockpitHeightRef.current + 0.025,
          0.88,
          1.42
        );
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "q") heightKeysRef.current.q = false;
      if (k === "e") heightKeysRef.current.e = false;
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("gesturestart", handleGestureStart, { passive: false });
    window.addEventListener("gesturechange", handleGestureChange, { passive: false });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("gesturestart", handleGestureStart);
      window.removeEventListener("gesturechange", handleGestureChange);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const seedOffset = config.seed * 0.17;
  const speedMs = (config.speedKmh * 1000) / 3600;

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);

    // 1. 连续推进车辆沿公路里程 Z
    carZRef.current += speedMs * dt;
    const z = carZRef.current;

    // 仅当跨越 48m 整区块边界时更新流式区块索引（避免频繁重渲染）
    const nextChunkIdx = Math.floor(z / ROAD_CONFIG.chunkLength);
    if (nextChunkIdx !== currentChunkRef.current) {
      currentChunkRef.current = nextChunkIdx;
      setCurrentChunk(nextChunkIdx);
    }
    onTelemetryUpdate?.(z);

    // 2. 计算目标车道横向偏移与换道转向角
    const targetLateral =
      config.lane === "right"
        ? ROAD_CONFIG.rightLaneOffset
        : ROAD_CONFIG.leftLaneOffset;
    const prevLateral = currentLateralRef.current;
    currentLateralRef.current = THREE.MathUtils.lerp(
      prevLateral,
      targetLateral,
      1 - Math.exp(-dt * 4.5)
    );
    const lateralVel =
      (currentLateralRef.current - prevLateral) / Math.max(dt, 0.001);
    steerAngleRef.current = THREE.MathUtils.clamp(
      lateralVel * 0.065,
      -0.42,
      0.42
    );

    // 3. 采样当前道路中心线与切线/法线，并同步全局渐显渐隐参考 Z 坐标与昼夜主题 Uniform
    CITYPOP_FADE_UNIFORMS.uCarZ.value = z;
    CITYPOP_THEME_UNIFORMS.uSunset.value = config.timeOfDay === "sunset" ? 1.0 : 0.0;
    const roadSample = sampleRoad(z, seedOffset);
    const carWorldPos = roadSample.position
      .clone()
      .addScaledVector(roadSample.leftNormal, currentLateralRef.current);

    // 车身细微悬架律动
    const engineBob = Math.sin(clock.getElapsedTime() * 18) * 0.0035;
    carWorldPos.y += engineBob;

    const carYaw = roadSample.yaw + steerAngleRef.current * 0.45;
    const carPitch = roadSample.pitch;
    const carRoll =
      -roadSample.curvature * 16.0 - steerAngleRef.current * 0.14;

    if (carGroupRef.current) {
      carGroupRef.current.position.copy(carWorldPos);
      carGroupRef.current.rotation.set(carPitch, carYaw, carRoll, "YXZ");
      carGroupRef.current.updateMatrixWorld();
    }

    // 4. 鼠标环视平滑滤波
    smoothedLookRef.current.x = THREE.MathUtils.lerp(
      smoothedLookRef.current.x,
      pointerRef.current.x,
      1 - Math.exp(-dt * 6)
    );
    smoothedLookRef.current.y = THREE.MathUtils.lerp(
      smoothedLookRef.current.y,
      pointerRef.current.y,
      1 - Math.exp(-dt * 6)
    );

    // 5. 计算三机位（追尾 Chase / 车头镜像回看 Front / 车内 Cockpit）坐标与注视点并平滑插值
    const targetBlend = config.cameraMode === "cockpit" ? 1 : 0;
    cockpitBlendRef.current = THREE.MathUtils.lerp(
      cockpitBlendRef.current,
      targetBlend,
      1 - Math.exp(-dt * 7.5)
    );
    const blend = cockpitBlendRef.current;

    const targetFront = config.cameraMode === "front" ? 1 : 0;
    frontBlendRef.current = THREE.MathUtils.lerp(
      frontBlendRef.current,
      targetFront,
      1 - Math.exp(-dt * 7.5)
    );
    const frontMix = frontBlendRef.current;

    // Q / E 键长按连续平滑调节车内摄像机高度
    if (heightKeysRef.current.q) {
      cockpitHeightRef.current = THREE.MathUtils.clamp(
        cockpitHeightRef.current - dt * 0.38,
        0.88,
        1.42
      );
    }
    if (heightKeysRef.current.e) {
      cockpitHeightRef.current = THREE.MathUtils.clamp(
        cockpitHeightRef.current + dt * 0.38,
        0.88,
        1.42
      );
    }

    // 全机位（含车内 Cockpit 与车外 Chase / Front）均支持平滑过渡并维持当前视角与推拉距离，不自动回正
    const orbitLerp = 1 - Math.exp(-dt * 10.0);

    orbitCurrentRef.current.yaw = THREE.MathUtils.lerp(
      orbitCurrentRef.current.yaw,
      orbitTargetRef.current.yaw,
      orbitLerp
    );
    orbitCurrentRef.current.pitch = THREE.MathUtils.lerp(
      orbitCurrentRef.current.pitch,
      orbitTargetRef.current.pitch,
      orbitLerp
    );
    chaseRadiusCurrentRef.current = THREE.MathUtils.lerp(
      chaseRadiusCurrentRef.current,
      chaseRadiusTargetRef.current,
      orbitLerp
    );
    cockpitFovCurrentRef.current = THREE.MathUtils.lerp(
      cockpitFovCurrentRef.current,
      cockpitFovTargetRef.current,
      orbitLerp
    );

    // 环绕检视混合权重：当视角偏离默认正前/正后方时，焦点平滑过渡到车身中心
    const orbitMag = Math.hypot(
      orbitCurrentRef.current.yaw,
      orbitCurrentRef.current.pitch
    );
    const targetOrbitMix =
      orbitMag > 0.04 ? THREE.MathUtils.clamp(orbitMag * 1.8, 0, 1) : 0;
    orbitMixRef.current = THREE.MathUtils.lerp(
      orbitMixRef.current,
      targetOrbitMix,
      1 - Math.exp(-dt * 8.0)
    );

    const baseRadius = chaseRadiusCurrentRef.current;
    const baseElevation = 0.34; // 默认仰角
    const totalPitch = THREE.MathUtils.clamp(
      baseElevation + orbitCurrentRef.current.pitch,
      0.12,
      1.15
    );
    // 车头镜像回看视角 (Front Cam) 将基础水平方位角镜像旋转 PI（位于车头正前方 +Z 回头看车）
    const baseYawOffset = frontMix * Math.PI;
    const totalYaw = orbitCurrentRef.current.yaw + baseYawOffset;
    const horizDist = Math.cos(totalPitch) * baseRadius;

    const chaseLocalPos = new THREE.Vector3(
      Math.sin(totalYaw) * horizDist -
        smoothedLookRef.current.x * 1.1 * (1 - orbitMixRef.current) * (1 - 2 * frontMix),
      Math.sin(totalPitch) * baseRadius -
        smoothedLookRef.current.y * 0.32 * (1 - orbitMixRef.current),
      -Math.cos(totalYaw) * horizDist
    );

    const defaultExteriorLook = new THREE.Vector3(
      -smoothedLookRef.current.x * 2.2 * (1 - 2 * frontMix),
      1.02 - smoothedLookRef.current.y * 0.55,
      THREE.MathUtils.lerp(19.0, -19.0, frontMix)
    );
    const inspectCarCenterLook = new THREE.Vector3(0, 0.92, 0.0);
    const chaseLocalLook = defaultExteriorLook.lerp(
      inspectCarCenterLook,
      orbitMixRef.current
    );

    // 机位 B：车内左舵驾驶员第一人称无限制球面环视视角 (Cockpit Cam)
    // 支持鼠标移动 + 拖拽/双指滑动全方位自由转头（左侧车窗/后视镜、右侧副驾/海面、下方仪表台/小键盘/档把、上方鸥翼门天窗乃至后排反应堆），Q / E 键实时调节坐姿高度
    const headYaw =
      -smoothedLookRef.current.x * 1.95 + orbitCurrentRef.current.yaw;
    const headPitch = THREE.MathUtils.clamp(
      -smoothedLookRef.current.y * 0.98 - orbitCurrentRef.current.pitch - 0.04,
      -1.28,
      1.28
    );
    const cockpitLocalPos = new THREE.Vector3(
      0.41 + Math.sin(headYaw) * 0.045,
      cockpitHeightRef.current,
      -0.18 + (1 - Math.cos(headYaw)) * 0.03
    );
    const cockpitLookDir = new THREE.Vector3(
      Math.sin(headYaw) * Math.cos(headPitch),
      Math.sin(headPitch),
      Math.cos(headYaw) * Math.cos(headPitch)
    );
    const cockpitLocalLook = cockpitLocalPos
      .clone()
      .addScaledVector(cockpitLookDir, 22.0);

    if (carGroupRef.current) {
      const worldChasePos = chaseLocalPos.applyMatrix4(
        carGroupRef.current.matrixWorld
      );
      const worldChaseLook = chaseLocalLook.applyMatrix4(
        carGroupRef.current.matrixWorld
      );
      const worldCockpitPos = cockpitLocalPos.applyMatrix4(
        carGroupRef.current.matrixWorld
      );
      const worldCockpitLook = cockpitLocalLook.applyMatrix4(
        carGroupRef.current.matrixWorld
      );

      const finalPos = worldChasePos.lerp(worldCockpitPos, blend);
      const finalLook = worldChaseLook.lerp(worldCockpitLook, blend);

      camera.position.copy(finalPos);
      camera.lookAt(finalLook);

      if (camera instanceof THREE.PerspectiveCamera) {
        const targetFov = THREE.MathUtils.lerp(
          54 + (config.speedKmh - 100) * 0.06,
          cockpitFovCurrentRef.current,
          blend
        );
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = targetFov;
          camera.updateProjectionMatrix();
        }
      }
    }
  });

  const fogColor =
    config.timeOfDay === "sunset"
      ? "#FFA43E"
      : CITY_POP_PALETTE.skyHorizon;

  return (
    <>
      {/* 远景地平线大气透视柔化雾（消除远处公路末端生硬截断） */}
      <fog attach="fog" args={[fogColor, 360, 660]} />

      {/* 铃木英人式高对比四阶色温分层赛璐璐光照（控制环境光不过曝，让 4 阶冷暖色块在车身与建筑立面上清晰分层） */}
      <ambientLight
        intensity={config.timeOfDay === "sunset" ? 0.22 : 0.18}
        color={config.timeOfDay === "sunset" ? "#FFB088" : "#6BA8F0"}
      />
      <directionalLight
        position={[-48, 54, -26]}
        intensity={config.timeOfDay === "sunset" ? 2.95 : 3.14}
        color={config.timeOfDay === "sunset" ? "#FF9E5E" : "#FFFDF6"}
      />
      <hemisphereLight
        args={[
          config.timeOfDay === "sunset" ? "#FF8A65" : "#5CB8FF",
          "#1B3268",
          0.24,
        ]}
      />

      {/* 海天远景、巨型积雨云、双色海岛、白色航站楼控制塔、流线型游艇与海鸥（每帧连续同步） */}
      <CityPopSkyAndOcean
        carZRef={carZRef}
        seed={config.seed}
        oceanMaterial={oceanMaterial}
        timeOfDay={config.timeOfDay}
      />

      {/* 程序化无限流式海滨双行道公路、防波堤、曲线海湾、羽状棕榈树、退台式酒店与跨海绿拱桥 */}
      <ProceduralCoastline
        currentChunk={currentChunk}
        seed={config.seed}
        oceanMaterial={oceanMaterial}
        timeOfDay={config.timeOfDay}
      />

      {/* 对向车道复古敞篷车流 */}
      <OncomingTraffic carZRef={carZRef} seed={config.seed} />

      {/* 玩家驾驶的 1985 DeLorean DMC-12 时间机器 */}
      <group ref={carGroupRef}>
        <Suspense fallback={null}>
          <DeLoreanCar
            speed={speedMs}
            steerAngle={steerAngleRef.current}
            isCockpitView={config.cameraMode === "cockpit"}
            onLoaded={onReady}
          />
        </Suspense>
      </group>
    </>
  );
}

export interface CityPopHighwayCanvasProps {
  config: CityPopHighwaySceneConfig;
  onReady?: () => void;
  onTelemetryUpdate?: (zMeters: number) => void;
}

export function CityPopHighwayCanvas({
  config,
  onReady,
  onTelemetryUpdate,
}: CityPopHighwayCanvasProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.NoToneMapping,
        }}
        dpr={[1, 2]}
        camera={{ position: [0, 5.6, -6.5], fov: 55, near: 0.08, far: 1500 }}
      >
        <HighwayWorldController
          config={config}
          onReady={onReady}
          onTelemetryUpdate={onTelemetryUpdate}
        />
      </Canvas>
    </div>
  );
}
