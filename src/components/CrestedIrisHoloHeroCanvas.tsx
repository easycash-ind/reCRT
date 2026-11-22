import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  NoToneMapping,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import {
  crestedIrisHoloFragmentShader,
  crestedIrisHoloVertexShader,
} from "./crestedIrisHoloShaders";

import {
  DEFAULT_IRIS_HOLO_SETTINGS,
  type IrisHoloSettings,
} from "./IrisHoloSettingsPanel";

export { DEFAULT_IRIS_HOLO_SETTINGS, type IrisHoloSettings };

export type HoloSpecimenId = "iris" | "orchid" | "sakura";

export interface HoloSpecimenMeta {
  id: HoloSpecimenId;
  code: string;
  cnName: string;
  enName: string;
  latinName: string;
  family: string;
  scanRef: string;
  glbUrl: string;
  baseScale: [number, number, number];
  baseYOffset: number;
  anchors: readonly { pos: [number, number, number]; gDist: number }[];
  calloutTitles: readonly [string, string, string, string, string];
  calloutSubtitles: readonly [string, string, string, string, string];
}

export const HOLO_SPECIMENS: Record<HoloSpecimenId, HoloSpecimenMeta> = {
  iris: {
    id: "iris",
    code: "01",
    cnName: "蝴蝶花",
    enName: "CRESTED IRIS",
    latinName: "IRIS JAPONICA THUNB.",
    family: "IRIDACEAE · CRESTED IRIS",
    scanRef: "FFPRI-QS1508-W03",
    glbUrl: "/scan-glb/crested_iris_holo_ready.glb",
    baseScale: [1.13, 0.91, 0.98],
    baseYOffset: -0.34,
    anchors: [
      { pos: [-1.1562, 1.6494, 0.5631], gDist: 0.839 },
      { pos: [0.3383, 1.9254, 0.2266], gDist: 0.815 },
      { pos: [-0.022, 0.4425, 0.7202], gDist: 0.631 },
      { pos: [1.3439, 0.4068, 0.9453], gDist: 0.863 },
      { pos: [-0.226, -1.7329, -0.589], gDist: 0.156 },
    ],
    calloutTitles: [
      "01 // INNER_STANDARD_TEPAL",
      "02 // FIMBRIATE_STYLE_CREST",
      "03 // CREST_PAPILLAE_CORE",
      "04 // TOPOGRAPHIC_ISOLINES",
      "05 // PEDICEL_SPATHE_NODE",
    ],
    calloutSubtitles: [
      "THIN-FILM Δn: 0.148 · λ=486nm",
      "TRIFID PETALOID CROWN · LOBE_APEX",
      "NECTAR GUIDE LUMINESCENCE · 612.8nm",
      "GEODESIC CONTOUR: 3.60 L/MM",
      "CHLORO_VASCULAR FLUX: 98.4% · BRACT_SHEATH",
    ],
  },
  orchid: {
    id: "orchid",
    code: "02",
    cnName: "白及",
    enName: "GROUND ORCHID",
    latinName: "BLETILLA STRIATA RCHB.F.",
    family: "ORCHIDACEAE · GROUND ORCHID",
    scanRef: "FFPRI-QS1507-W25",
    glbUrl: "/scan-glb/ground_orchid_holo_ready.glb",
    baseScale: [0.80, 0.76, 0.80],
    baseYOffset: -0.28,
    anchors: [
      { pos: [-1.1925, 1.4116, 0.3662], gDist: 0.745 },
      { pos: [0.35, 1.85, 0.097], gDist: 0.694 },
      { pos: [0.0355, 0.3175, 0.6591], gDist: 0.716 },
      { pos: [1.537, -0.0175, 0.4665], gDist: 0.658 },
      { pos: [0.0085, -1.95, -1.252], gDist: 0.127 },
    ],
    calloutTitles: [
      "01 // LATERAL_SEPAL_LAMINA",
      "02 // DORSAL_SEPAL_APEX",
      "03 // LABELLUM_CREST_FOLDS",
      "04 // ORCHID_VEIN_ISOLINES",
      "05 // GYNOSTEMIUM_PEDICEL",
    ],
    calloutSubtitles: [
      "DISPERSION Δn: 0.162 · λ=442nm",
      "ZYGOMORPHIC CROWN · MEDIAN_HOOD",
      "RUFFLED LIP LAMELLAE · 594.2nm",
      "RADIAL VEIN CONTOUR: 3.60 L/MM",
      "RESUPINATE OVARY AXIS · FLUX_99.1%",
    ],
  },
  sakura: {
    id: "sakura",
    code: "03",
    cnName: "河津樱",
    enName: "KAWAZU SAKURA",
    latinName: "PRUNUS LANNESIANA WILS.",
    family: "ROSACEAE · KAWAZU-ZAKURA",
    scanRef: "FFPRI-QS1507-W03",
    glbUrl: "/scan-glb/kawazu_sakura_holo_ready.glb",
    baseScale: [0.92, 0.86, 0.90],
    baseYOffset: -0.26,
    anchors: [
      { pos: [-0.95, 1.15, 0.3346], gDist: 0.791 },
      { pos: [0.35, 1.65, 0.0423], gDist: 0.799 },
      { pos: [0.0203, 0.375, 0.5961], gDist: 0.73 },
      { pos: [1.45, 0.0765, 0.2824], gDist: 0.687 },
      { pos: [0.122, -1.75, -0.9552], gDist: 0.195 },
    ],
    calloutTitles: [
      "01 // EMARGINATE_PETAL_LOBE",
      "02 //APICAL_COROLLA_NOTCH",
      "03 // STAMEN_ANTHER_CORONA",
      "04 // SAKURA_VEIN_ISOLINES",
      "05 // HYPANTHIUM_CALYX_TUBE",
    ],
    calloutSubtitles: [
      "THIN-FILM Δn: 0.139 · λ=498nm",
      "BIFID PETAL MARGIN · ROSACEAE",
      "POLYANDROUS FILAMENT RING · 608nm",
      "RADIAL PETAL CONTOUR: 3.60 L/MM",
      "PEDICEL VASCULAR BUNDLE · 98.8%",
    ],
  },
};

function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

class IrisWebglErrorBoundary extends Component<
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

function StaticIrisFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-[48%] h-[420px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[90px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,132,48,0.34) 0%, rgba(72,188,255,0.32) 38%, rgba(138,56,255,0.24) 68%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}

function configureRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1.0;
}

function CrestedIrisSpecimenScene({
  onReady,
  settings,
  specimenId,
  calloutSvgRef,
}: {
  onReady?: () => void;
  settings: IrisHoloSettings;
  specimenId: HoloSpecimenId;
  calloutSvgRef?: RefObject<SVGSVGElement | null>;
}) {
  const { gl, size, camera } = useThree();
  const specimenMeta = HOLO_SPECIMENS[specimenId];
  const gltf = useGLTF(specimenMeta.glbUrl);

  const rootGroupRef = useRef<Group>(null);
  const frontMeshRef = useRef<Mesh>(null);
  const projScratchRef = useRef(new Vector3());
  const drawingBufSizeRef = useRef(new Vector2(1600, 900));
  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointerCurrent = useRef({ x: 0, y: 0 });
  const pointerEnergy = useRef(0.22);
  const elapsedRef = useRef(0);
  const sparkElapsedRef = useRef(0);
  const reportedRef = useRef(false);

  // 鼠标按住拖拽旋转/平移偏移状态（限制在一定弧度与空间范围内）
  const isDraggingRef = useRef(false);
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const dragTargetRef = useRef({ yaw: 0, pitch: 0, shiftX: 0, shiftY: 0 });
  const dragCurrentRef = useRef({ yaw: 0, pitch: 0, shiftX: 0, shiftY: 0 });

  useEffect(() => {
    configureRenderer(gl);
    onReady?.();
  }, [gl, onReady]);

  useEffect(() => {
    const softLimit = (val: number, maxLimit: number) =>
      maxLimit * Math.tanh(val / maxLimit);

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          'input, button, a, [data-draggable-module="true"], [role="tablist"]'
        )
      ) {
        return;
      }
      isDraggingRef.current = true;
      lastDragPosRef.current = { x: e.clientX, y: e.clientY };
      document.body.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      pointerTarget.current.x = nx;
      pointerTarget.current.y = ny;
      pointerEnergy.current = Math.min(pointerEnergy.current + 0.14, 1.25);

      if (isDraggingRef.current) {
        const dx = e.clientX - lastDragPosRef.current.x;
        const dy = e.clientY - lastDragPosRef.current.y;
        lastDragPosRef.current = { x: e.clientX, y: e.clientY };

        dragTargetRef.current.yaw = softLimit(
          dragTargetRef.current.yaw + dx * 0.0045,
          0.62
        );
        dragTargetRef.current.pitch = softLimit(
          dragTargetRef.current.pitch + dy * 0.0038,
          0.42
        );
        dragTargetRef.current.shiftX = softLimit(
          dragTargetRef.current.shiftX + dx * 0.0022,
          0.48
        );
        dragTargetRef.current.shiftY = softLimit(
          dragTargetRef.current.shiftY - dy * 0.0022,
          0.36
        );
        pointerEnergy.current = 1.35;
      }
    };

    const endDrag = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
    };

    const onDoubleClick = (e: MouseEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('input, button, a, [data-draggable-module="true"]'))
        return;
      dragTargetRef.current = { yaw: 0, pitch: 0, shiftX: 0, shiftY: 0 };
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("dblclick", onDoubleClick);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("dblclick", onDoubleClick);
      document.body.style.cursor = "";
    };
  }, []);

  const { specimenGeometry, specimenTexture } = useMemo(() => {
    let foundGeo: BufferGeometry | null = null;
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
        if (!foundGeo) {
          const cloned = mesh.geometry.clone();
          if (!cloned.attributes._iris_meta) {
            const count = cloned.attributes.position.count;
            const fallbackMeta = new Float32Array(count * 4);
            for (let i = 0; i < count; i++) {
              fallbackMeta[i * 4 + 0] = 0.5;
              fallbackMeta[i * 4 + 1] = 0.45;
              fallbackMeta[i * 4 + 2] = (i % 100) / 100;
              fallbackMeta[i * 4 + 3] = 0.5;
            }
            cloned.setAttribute(
              "_iris_meta",
              new BufferAttribute(fallbackMeta, 4)
            );
          }
          foundGeo = cloned;
        }
      }
    });

    return {
      specimenGeometry: foundGeo ?? new PlaneGeometry(3, 3),
      specimenTexture: foundTex,
    };
  }, [gltf.scene]);

  const backdropTarget = useMemo(() => {
    return new WebGLRenderTarget(512, 512, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
    });
  }, []);

  useEffect(() => {
    const w = Math.max(Math.round(size.width * 0.28), 200);
    const h = Math.max(Math.round(size.height * 0.28), 140);
    backdropTarget.setSize(w, h);
  }, [size.width, size.height, backdropTarget]);

  useEffect(() => {
    return () => {
      backdropTarget.dispose();
    };
  }, [backdropTarget]);

  const createHoloMaterial = useCallback(
    (
      side: typeof BackSide | typeof FrontSide | typeof DoubleSide,
      opacity: number,
      renderPass: number,
      depthWrite: boolean,
      useBackdrop = 0.0
    ) => {
      return new ShaderMaterial({
        vertexShader: crestedIrisHoloVertexShader,
        fragmentShader: crestedIrisHoloFragmentShader,
        uniforms: {
          uMap: { value: specimenTexture },
          uBackdropTex: { value: useBackdrop > 0.5 ? backdropTarget.texture : null },
          uScreenRes: { value: new Vector2(size.width, size.height) },
          uUseBackdrop: { value: useBackdrop },
          uFrostBlur: { value: settings.frostBlur },
          uTime: { value: 0 },
          uSparkTime: { value: 0 },
          uCameraPos: { value: new Vector3(0, 0, 7.0) },
          uPassOpacity: { value: opacity },
          uPetalOpacity: { value: settings.petalOpacity },
          uContourDensity: { value: settings.contourDensity },
          uIridescenceStrength: { value: settings.iridescenceStrength },
          uSpectrumShift: { value: settings.spectrumShift },
          uSparkDensity: { value: settings.sparkDensity },
          uSparkTrailLength: { value: settings.sparkTrailLength },
          uSparkGlow: { value: settings.sparkGlow },
          uRenderPass: { value: renderPass },
          uPointerWorld: { value: new Vector3(0, 0, 0) },
          uPointerEnergy: { value: 0.22 },
        },
        side,
        transparent: true,
        depthWrite,
        blending: NormalBlending,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [specimenTexture, backdropTarget]
  );

  // Pass 1: 先绘制花茎与苞片，确保花茎深度与色彩完整连贯
  const stemPassMaterial = useMemo(
    () => createHoloMaterial(FrontSide, 0.96, 0.0, true, 0.0),
    [createHoloMaterial]
  );
  // Pass 2: 绘制花瓣底色层（双面，供离屏磨砂背景捕获重瓣遮挡关系）
  const backPassMaterial = useMemo(
    () => createHoloMaterial(DoubleSide, 0.52, 1.0, false, 0.0),
    [createHoloMaterial]
  );
  // Pass 3: 绘制花瓣正面磨砂玻璃折射 + 薄膜干涉与等高流线层
  const frontPassMaterial = useMemo(
    () => createHoloMaterial(FrontSide, 0.95, 1.0, true, 1.0),
    [createHoloMaterial]
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    elapsedRef.current += dt * settings.motionSpeed;
    sparkElapsedRef.current += dt * settings.sparkSpeed;
    const t = elapsedRef.current;
    const st = sparkElapsedRef.current;

    if (!reportedRef.current && onReady) {
      reportedRef.current = true;
      onReady();
    }

    pointerCurrent.current.x = MathUtils.lerp(
      pointerCurrent.current.x,
      pointerTarget.current.x,
      0.06
    );
    pointerCurrent.current.y = MathUtils.lerp(
      pointerCurrent.current.y,
      pointerTarget.current.y,
      0.06
    );
    pointerEnergy.current = MathUtils.lerp(
      pointerEnergy.current,
      0.2,
      dt * 1.6
    );

    // 未按住拖拽时，缓慢向中心平衡态柔和回弹一部分，同时保留用户拖出的观赏角度余韵
    if (!isDraggingRef.current) {
      dragTargetRef.current.yaw = MathUtils.lerp(
        dragTargetRef.current.yaw,
        0,
        dt * 0.45
      );
      dragTargetRef.current.pitch = MathUtils.lerp(
        dragTargetRef.current.pitch,
        0,
        dt * 0.45
      );
      dragTargetRef.current.shiftX = MathUtils.lerp(
        dragTargetRef.current.shiftX,
        0,
        dt * 0.55
      );
      dragTargetRef.current.shiftY = MathUtils.lerp(
        dragTargetRef.current.shiftY,
        0,
        dt * 0.55
      );
    }

    dragCurrentRef.current.yaw = MathUtils.lerp(
      dragCurrentRef.current.yaw,
      dragTargetRef.current.yaw,
      0.12
    );
    dragCurrentRef.current.pitch = MathUtils.lerp(
      dragCurrentRef.current.pitch,
      dragTargetRef.current.pitch,
      0.12
    );
    dragCurrentRef.current.shiftX = MathUtils.lerp(
      dragCurrentRef.current.shiftX,
      dragTargetRef.current.shiftX,
      0.12
    );
    dragCurrentRef.current.shiftY = MathUtils.lerp(
      dragCurrentRef.current.shiftY,
      dragTargetRef.current.shiftY,
      0.12
    );

    const isDesktop = size.width >= 900;
    const responsiveFactor = isDesktop ? 1.0 : 0.78;
    const [sx, sy, sz] = specimenMeta.baseScale;

    if (rootGroupRef.current) {
      const pitch =
        Math.sin(t * 0.3) * 0.024 +
        pointerCurrent.current.y * 0.048 +
        dragCurrentRef.current.pitch;
      const yaw =
        Math.cos(t * 0.24) * 0.038 +
        pointerCurrent.current.x * 0.065 +
        dragCurrentRef.current.yaw;
      const roll =
        Math.sin(t * 0.2) * 0.012 - dragCurrentRef.current.yaw * 0.15;

      rootGroupRef.current.position.set(
        dragCurrentRef.current.shiftX,
        specimenMeta.baseYOffset * responsiveFactor +
          dragCurrentRef.current.shiftY,
        0.0
      );
      rootGroupRef.current.rotation.set(pitch, yaw, roll);
      rootGroupRef.current.scale.set(
        sx * responsiveFactor,
        sy * responsiveFactor,
        sz * responsiveFactor
      );
      rootGroupRef.current.updateMatrixWorld();

      // 实时将当前标本模型上的 5 个 3D 解剖锚点投影至 2D SVG 视口平面，驱动引线与科研标注说明同步跟随
      const svgEl = calloutSvgRef?.current;
      if (svgEl) {
        const scratch = projScratchRef.current;
        const pivotX = -0.06;
        const pivotY = -2.45;
        const anchors = specimenMeta.anchors;

        for (let i = 0; i < anchors.length; i++) {
          const anchor = anchors[i];
          const [lx, ly, lz] = anchor.pos;
          const swayFactor = smoothstepJS(0.04, 0.92, anchor.gDist);
          const swayXY =
            (Math.sin(t * 0.62) * 0.012 + Math.cos(t * 0.39 + 1.1) * 0.008) *
            swayFactor;
          const swayXZ = Math.sin(t * 0.48 + 0.5) * 0.01 * swayFactor;

          // 与顶点着色器一致的呼吸微摆变换
          const dx = lx - pivotX;
          const dy = ly - pivotY;
          const cosXY = Math.cos(swayXY);
          const sinXY = Math.sin(swayXY);
          const rx = pivotX + (dx * cosXY - dy * sinXY);
          const ry = pivotY + (dx * sinXY + dy * cosXY);

          const cosXZ = Math.cos(swayXZ);
          const sinXZ = Math.sin(swayXZ);
          const fx = rx * cosXZ - lz * sinXZ;
          const fz = rx * sinXZ + lz * cosXZ;

          scratch.set(fx, ry, fz);
          scratch.applyMatrix4(rootGroupRef.current.matrixWorld);
          scratch.project(camera);

          const svgX = (scratch.x * 0.5 + 0.5) * 1600;
          const svgY = (-scratch.y * 0.5 + 0.5) * 900;

          const node = svgEl.querySelector(
            `[data-callout-anchor="${i}"]`
          ) as SVGGElement | null;
          if (node) {
            node.setAttribute(
              "transform",
              `translate(${svgX.toFixed(1)}, ${svgY.toFixed(1)})`
            );
          }
        }
      }
    }

    const ptrWorldX = pointerCurrent.current.x * 3.2;
    const ptrWorldY = pointerCurrent.current.y * 2.2;
    state.gl.getDrawingBufferSize(drawingBufSizeRef.current);

    for (const mat of [stemPassMaterial, backPassMaterial, frontPassMaterial]) {
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uSparkTime.value = st;
      u.uCameraPos.value.copy(camera.position);
      u.uScreenRes.value.copy(drawingBufSizeRef.current);
      u.uFrostBlur.value = settings.frostBlur;
      u.uPetalOpacity.value = settings.petalOpacity;
      u.uContourDensity.value = settings.contourDensity;
      u.uIridescenceStrength.value = settings.iridescenceStrength;
      u.uSpectrumShift.value = settings.spectrumShift;
      u.uSparkDensity.value = settings.sparkDensity;
      u.uSparkTrailLength.value = settings.sparkTrailLength;
      u.uSparkGlow.value = settings.sparkGlow;
      u.uPointerWorld.value.set(ptrWorldX, ptrWorldY, 0);
      u.uPointerEnergy.value = pointerEnergy.current;
    }

    // 离屏捕获花瓣背后的场景（花茎 Pass 1 + 背面花瓣 Pass 2），供正面磨砂玻璃花瓣采样模糊
    if (frontMeshRef.current) {
      frontMeshRef.current.visible = false;
      const prevTarget = state.gl.getRenderTarget();
      state.gl.setRenderTarget(backdropTarget);
      state.gl.clear(true, true, false);
      state.gl.render(state.scene, state.camera);
      state.gl.setRenderTarget(prevTarget);
      frontMeshRef.current.visible = true;
    }
  });

  return (
    <>
      <group ref={rootGroupRef}>
        {/* Pass 1: 花梗与苞片底层通道 */}
        <mesh
          geometry={specimenGeometry}
          material={stemPassMaterial}
          renderOrder={1}
        />

        {/* Pass 2: 花冠背面深邃玻璃透射层 */}
        <mesh
          geometry={specimenGeometry}
          material={backPassMaterial}
          renderOrder={2}
        />

        {/* Pass 3: 花冠正面磨砂玻璃折射 + 虹彩薄膜与超精细等高流线层 */}
        <mesh
          ref={frontMeshRef}
          geometry={specimenGeometry}
          material={frontPassMaterial}
          renderOrder={3}
        />
      </group>
    </>
  );
}

useGLTF.preload(HOLO_SPECIMENS.iris.glbUrl);
useGLTF.preload(HOLO_SPECIMENS.orchid.glbUrl);
useGLTF.preload(HOLO_SPECIMENS.sakura.glbUrl);

export function CrestedIrisHoloHeroCanvas({
  onReady,
  settings = DEFAULT_IRIS_HOLO_SETTINGS,
  specimenId = "iris",
  calloutSvgRef,
}: {
  onReady?: () => void;
  settings?: IrisHoloSettings;
  specimenId?: HoloSpecimenId;
  calloutSvgRef?: RefObject<SVGSVGElement | null>;
}) {
  const [webglFailed, setWebglFailed] = useState(false);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.setClearColor("#000000", 1);
      configureRenderer(gl);

      const canvas = gl.domElement;
      const onLost = (e: Event) => {
        e.preventDefault();
        setWebglFailed(true);
        onReady?.();
      };
      canvas.addEventListener("webglcontextlost", onLost, { once: true });
    },
    [onReady]
  );

  const handleError = useCallback(() => {
    setWebglFailed(true);
    onReady?.();
  }, [onReady]);

  if (webglFailed) {
    return <StaticIrisFallback onReady={onReady} />;
  }

  return (
    <IrisWebglErrorBoundary
      fallback={<StaticIrisFallback onReady={onReady} />}
      onError={handleError}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
        aria-hidden
      >
        <Canvas
          camera={{ position: [0, 0.08, 7.0], fov: 38, near: 0.1, far: 30 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          }}
          style={{ width: "100%", height: "100%", display: "block" }}
          onCreated={handleCreated}
        >
          <color attach="background" args={["#000000"]} />
          <Suspense fallback={null}>
            <CrestedIrisSpecimenScene
              key={specimenId}
              onReady={onReady}
              settings={settings}
              specimenId={specimenId}
              calloutSvgRef={calloutSvgRef}
            />
            <EffectComposer multisampling={0}>
              <Bloom
                intensity={settings.bloomIntensity}
                luminanceThreshold={0.72}
                luminanceSmoothing={0.26}
                mipmapBlur
              />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>
    </IrisWebglErrorBoundary>
  );
}
