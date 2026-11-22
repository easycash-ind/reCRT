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
  BufferGeometry,
  DoubleSide,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
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
  azaleaAsciiFragmentShader,
  azaleaAsciiVertexShader,
  azaleaBioFragmentShader,
  azaleaBioVertexShader,
  createBioElectricGlyphAtlas,
} from "./azaleaBioShaders";

const AZALEA_GLB_URL = "/scan-glb/oomurasaki_azalea_ascii_ready.glb";

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

function StaticAzaleaFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div
        className="absolute left-[30%] top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[80px]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,140,26,0.38) 0%, rgba(184,24,104,0.34) 42%, rgba(16,29,90,0.25) 75%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

function AzaleaBioPipeline({
  onReady,
  settings,
}: {
  onReady?: () => void;
  settings: AsciiArtSettings;
}) {
  const { gl, size, viewport } = useThree();
  const gltf = useGLTF(AZALEA_GLB_URL);

  const postMatRef = useRef<ShaderMaterial>(null);
  const azaleaHolderRef = useRef<Group>(null);

  const mouseTarget = useRef(new Vector2(0, 0));
  const mouseCurrent = useRef(new Vector2(0, 0));
  const pointerStimulusRef = useRef(0.35);
  const reported = useRef(false);
  const animTimeRef = useRef(0);

  const consoleRectRef = useRef(new Vector4(0.68, 0.31, 0.91, 0.72));

  useEffect(() => {
    configurePostProcessingRenderer(gl);
    onReady?.();
  }, [gl, onReady]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      mouseTarget.current.set(nx, ny);
      pointerStimulusRef.current = Math.min(pointerStimulusRef.current + 0.18, 1.45);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const { texture: glyphAtlas, glyphCount } = useMemo(
    () => createBioElectricGlyphAtlas(),
    []
  );

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
          const clonedGeo = mesh.geometry.clone();
          if (
            !clonedGeo.attributes._azalea_meta &&
            clonedGeo.attributes._sakura_meta
          ) {
            clonedGeo.setAttribute(
              "_azalea_meta",
              clonedGeo.attributes._sakura_meta
            );
          }
          foundGeo = clonedGeo;
        }
      }
    });

    return {
      specimenGeometry: foundGeo ?? new PlaneGeometry(3, 3),
      specimenTexture: foundTex,
    };
  }, [gltf.scene]);

  const bioShaderMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: azaleaBioVertexShader,
      fragmentShader: azaleaBioFragmentShader,
      uniforms: {
        uMap: { value: specimenTexture },
        uTime: { value: 0 },
        uSpectrumMode: { value: settings.bioSpectrum ?? 2 },
        uPulseSpeed: { value: settings.bioPulseSpeed ?? 1.0 },
        uPulseIntensity: { value: settings.bioPulseIntensity ?? 1.2 },
        uThermalSpread: { value: settings.bioThermalSpread ?? 1.0 },
        uPointerWorld: { value: new Vector3(0, 0, 0) },
        uPointerStimulus: { value: 0.35 },
      },
      side: DoubleSide,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specimenTexture]);

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
      uFocusCenter: { value: new Vector2(0.28, 0.5) },
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
      uSpectrumMode: { value: settings.bioSpectrum ?? 2 },
      uBioBouncePulse: { value: 1.0 },
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
      0.07
    );
    mouseCurrent.current.y = MathUtils.lerp(
      mouseCurrent.current.y,
      mouseTarget.current.y,
      0.07
    );
    pointerStimulusRef.current = MathUtils.lerp(
      pointerStimulusRef.current,
      0.35,
      clampedDelta * 1.8
    );

    const isDesktop = size.width >= 900;
    const specimenNormX = isDesktop ? 0.275 : 0.42;
    const specimenNormY = isDesktop ? 0.48 : 0.32;
    const focusNormX = isDesktop ? 0.285 : 0.44;
    const focusNormY = isDesktop ? 0.50 : 0.32;

    const vHeight =
      2 *
      Math.tan(MathUtils.degToRad(offscreenCamera.fov * 0.5)) *
      offscreenCamera.position.z;
    const vWidth = vHeight * offscreenCamera.aspect;

    const worldX = (specimenNormX - 0.5) * vWidth;
    const worldY = (specimenNormY - 0.5) * vHeight;
    const pointerWorldX = mouseCurrent.current.x * 0.5 * vWidth;
    const pointerWorldY = mouseCurrent.current.y * 0.5 * vHeight;

    const modelScale = settings.modelScale ?? 1.0;
    const tiltAmt = settings.tiltRandomness ?? 0.65;

    const gentlePitch =
      (tiltAmt - 0.65) * 0.10 +
      Math.sin(elapsed * 0.36) * 0.035 +
      mouseCurrent.current.y * 0.06;
    const gentleYaw =
      Math.sin(elapsed * 0.28) * 0.075 +
      mouseCurrent.current.x * 0.08;
    const gentleRoll = -0.03 + Math.cos(elapsed * 0.31) * 0.025;

    const baseScale = (isDesktop ? 1.34 : 0.94) * modelScale;

    if (azaleaHolderRef.current) {
      azaleaHolderRef.current.position.set(worldX, worldY, 0);
      azaleaHolderRef.current.rotation.set(gentlePitch, gentleYaw, gentleRoll);
      azaleaHolderRef.current.scale.set(
        baseScale,
        baseScale,
        baseScale * MathUtils.lerp(0.75, 1.15, settings.extrudeScale * 0.5)
      );
      azaleaHolderRef.current.updateMatrixWorld();
    }

    const pulseSpeed = settings.bioPulseSpeed ?? 1.0;
    const pulseIntensity = settings.bioPulseIntensity ?? 1.2;
    const thermalSpread = settings.bioThermalSpread ?? 1.0;
    const spectrumMode = settings.bioSpectrum ?? 2;

    const bu = bioShaderMaterial.uniforms;
    bu.uTime.value = elapsed;
    bu.uSpectrumMode.value = spectrumMode;
    bu.uPulseSpeed.value = pulseSpeed;
    bu.uPulseIntensity.value = pulseIntensity;
    bu.uThermalSpread.value = thermalSpread;
    bu.uPointerWorld.value.set(pointerWorldX, pointerWorldY, 0);
    bu.uPointerStimulus.value = pointerStimulusRef.current;

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
      u.uSpectrumMode.value = spectrumMode;

      // 生物电脉冲到达花瓣尖端时，联动右侧登录台边缘泛起光谱漫反射呼吸脉冲
      const wavePhase = (elapsed * 0.28 * pulseSpeed) % 1.0;
      const crestArrival = Math.exp(-Math.pow((wavePhase - 0.72) * 3.8, 2.0));
      u.uBioBouncePulse.value = MathUtils.clamp(
        (0.45 + 0.85 * crestArrival) * pulseIntensity + pointerStimulusRef.current * 0.25,
        0.0,
        1.8
      );
      const cRect = consoleRectRef.current;
      u.uConsoleRect.value.set(cRect.x, cRect.y, cRect.z, cRect.w);
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
            color="#fff6f0"
          />
          <directionalLight
            position={[5.0, -3.5, 3.0]}
            intensity={1.35}
            color="#ffd6e7"
          />

          <group ref={azaleaHolderRef}>
            <mesh geometry={specimenGeometry} material={bioShaderMaterial} />
          </group>
        </>,
        offscreenScene
      )}

      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <shaderMaterial
          ref={postMatRef}
          vertexShader={azaleaAsciiVertexShader}
          fragmentShader={azaleaAsciiFragmentShader}
          uniforms={uniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}

useGLTF.preload(AZALEA_GLB_URL);

export function AzaleaBioHeroCanvas({
  onReady,
  settings = DEFAULT_ASCII_ART_SETTINGS,
}: {
  onReady?: () => void;
  settings?: AsciiArtSettings;
}) {
  const [webglFailed, setWebglFailed] = useState(false);

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.setClearColor("#000000", 1);
      configurePostProcessingRenderer(gl);

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
    return <StaticAzaleaFallback onReady={onReady} />;
  }

  return (
    <AsciiErrorBoundary
      fallback={<StaticAzaleaFallback onReady={onReady} />}
      onError={handleError}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
        aria-hidden
      >
        <Canvas
          orthographic
          camera={{ position: [0, 0, 5], zoom: 100, near: 0.1, far: 20 }}
          dpr={[1, 2]}
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: "high-performance",
          }}
          style={{ width: "100%", height: "100%", display: "block" }}
          onCreated={handleCreated}
        >
          <color attach="background" args={["#000000"]} />
          <Suspense fallback={null}>
            <AzaleaBioPipeline onReady={onReady} settings={settings} />
            <EffectComposer multisampling={0}>
              <Bloom
                intensity={0.42 * (settings.glowIntensity / 1.55)}
                luminanceThreshold={0.78}
                luminanceSmoothing={0.22}
                mipmapBlur
              />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>
    </AsciiErrorBoundary>
  );
}
