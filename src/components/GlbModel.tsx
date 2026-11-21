import {
  Component,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  SRGBColorSpace,
} from "three";
import type { Vector3Tuple, Object3D, Material } from "three";

export interface IconGlowControls {
  发光颜色: string;
  发光强度: number;
  过渡速度: number;
}

interface GlbModelProps {
  url: string;
  fallbackColor?: string;
  fallbackSize?: Vector3Tuple;
  scale?: number;
  /** Disable click-bounce and hover-scale (used when parent handles interactions) */
  disableInteraction?: boolean;
  /** Ref that tracks whether the parent is hovered (read every frame, avoids re-renders) */
  hoveredRef?: MutableRefObject<boolean>;
  /** Glow control values from Leva panel */
  glowControls?: IconGlowControls;
}

const BOUNCE_PEAK = 1.12;
const BOUNCE_SPEED = 8;
const HOVER_SCALE = 1.12;
const HOVER_LERP = 0.08;

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; url: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[login-scene] Model ${this.props.url} failed, using fallback:`, error);
  }

  componentDidUpdate(previous: Readonly<{ url: string }>) {
    if (previous.url !== this.props.url && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Tries to load a GLB model from the given URL.
 * Falls back to a colored box if the file is unavailable.
 * Clicking the model triggers a spring-like bounce animation.
 * Hovering scales it up smoothly.
 */
export function GlbModel({
  url,
  fallbackColor = "#888888",
  fallbackSize = [1, 1, 0.2],
  scale = 1,
  disableInteraction = false,
  hoveredRef,
  glowControls,
}: GlbModelProps) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        const ct = res.headers.get("content-type") ?? "";
        setAvailable(res.ok && !ct.includes("text/html"));
      })
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, [url]);

  if (available === null) return null;

  if (!available) {
    return (
      <FallbackBox
        scale={scale}
        fallbackColor={fallbackColor}
        fallbackSize={fallbackSize}
        disableInteraction={disableInteraction}
      />
    );
  }

  const fallback = (
    <FallbackBox
      scale={scale}
      fallbackColor={fallbackColor}
      fallbackSize={fallbackSize}
      disableInteraction={disableInteraction}
    />
  );

  return (
    <ModelErrorBoundary url={url} fallback={fallback}>
      <LoadedModel
        url={url}
        scale={scale}
        disableInteraction={disableInteraction}
        hoveredRef={hoveredRef}
        glowControls={glowControls}
      />
    </ModelErrorBoundary>
  );
}

function useBounce(baseScale: number) {
  const groupRef = useRef<Group>(null);
  const bouncing = useRef(false);
  const hovered = useRef(false);
  const t = useRef(0);

  const onClick = useCallback(() => {
    bouncing.current = true;
    t.current = 0;
  }, []);

  const onPointerOver = useCallback(() => { hovered.current = true; }, []);
  const onPointerOut = useCallback(() => { hovered.current = false; }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const restScale = hovered.current ? baseScale * HOVER_SCALE : baseScale;

    if (bouncing.current) {
      t.current += delta * BOUNCE_SPEED;
      const raw = Math.min(t.current / Math.PI, 1);
      const envelope = Math.sin(raw * Math.PI);
      const bump = envelope * envelope * (BOUNCE_PEAK - 1);
      const s = restScale * (1 + bump);
      groupRef.current.scale.setScalar(s);

      if (raw >= 1) {
        bouncing.current = false;
        groupRef.current.scale.setScalar(restScale);
      }
    } else {
      const current = groupRef.current.scale.x;
      if (Math.abs(current - restScale) > 0.001) {
        const s = MathUtils.lerp(current, restScale, HOVER_LERP);
        groupRef.current.scale.setScalar(s);
      }
    }
  });

  return { groupRef, onClick, onPointerOver, onPointerOut };
}

/**
 * Fix color space for GLB models exported from C4D.
 *
 * C4D writes sRGB color values directly into glTF baseColorFactor without
 * the required sRGB→Linear conversion. The GLTFLoader stores these values
 * as-is in Linear space, so the renderer treats e.g. sRGB #DC1A00
 * (0.863, 0.102, 0) as a Linear value — which is too bright/shifted.
 *
 * The fix: mark the color as SRGBColorSpace so Three.js applies the correct
 * sRGB→Linear conversion at render time, matching the intended sRGB color.
 */
/**
 * Recompute smooth vertex normals for all mesh geometries that lack them
 * or have flat shading artifacts from the export tool.
 */
export function ensureSmoothNormals(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const geo = child.geometry;
    if (geo instanceof BufferGeometry) {
      geo.computeVertexNormals();
    }
  });
}

export function fixMaterialColorSpace(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    const isArray = Array.isArray(child.material);
    const originals = ([] as Material[]).concat(child.material as Material | Material[]);
    const fixed = originals.map((mat) => {
      if (
        mat instanceof MeshStandardMaterial ||
        mat instanceof MeshPhysicalMaterial
      ) {
        const clonedMat = mat.clone();
        clonedMat.color.setRGB(mat.color.r, mat.color.g, mat.color.b, SRGBColorSpace);
        return clonedMat;
      }
      return mat;
    });
    child.material = isArray ? fixed : fixed[0];
  });
}

function LoadedModel({
  url,
  scale,
  disableInteraction,
  hoveredRef,
  glowControls,
}: {
  url: string;
  scale: number;
  disableInteraction: boolean;
  hoveredRef?: MutableRefObject<boolean>;
  glowControls?: IconGlowControls;
}) {
  const { scene } = useGLTF(url);
  const { groupRef, onClick, onPointerOver, onPointerOut } = useBounce(scale);
  const iconMatRef = useRef<MeshStandardMaterial | null>(null);
  const glowColor = useRef(new Color());

  const cloned = useMemo(() => {
    const c = scene.clone();
    fixMaterialColorSpace(c);
    ensureSmoothNormals(c);
    return c;
  }, [scene]);

  useEffect(() => {
    iconMatRef.current = null;
    cloned.traverse((child) => {
      if (
        child instanceof Mesh &&
        child.name.toLowerCase() === "icon" &&
        (child.material instanceof MeshStandardMaterial ||
         child.material instanceof MeshPhysicalMaterial)
      ) {
        iconMatRef.current = child.material as MeshStandardMaterial;
      }
    });
  }, [cloned]);

  useFrame(() => {
    const mat = iconMatRef.current;
    if (!mat || !glowControls) return;

    const isHovered = hoveredRef?.current ?? false;
    const targetIntensity = isHovered ? glowControls.发光强度 : 0;
    mat.emissiveIntensity = MathUtils.lerp(
      mat.emissiveIntensity,
      targetIntensity,
      glowControls.过渡速度,
    );
    glowColor.current.set(glowControls.发光颜色);
    mat.emissive.copy(glowColor.current);
  });

  if (disableInteraction) {
    return (
      <group scale={scale}>
        <primitive object={cloned} castShadow receiveShadow />
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      scale={scale}
    >
      <primitive object={cloned} castShadow receiveShadow />
    </group>
  );
}

function FallbackBox({
  scale,
  fallbackColor,
  fallbackSize,
  disableInteraction,
}: {
  scale: number;
  fallbackColor: string;
  fallbackSize: Vector3Tuple;
  disableInteraction: boolean;
}) {
  const { groupRef, onClick, onPointerOver, onPointerOut } = useBounce(scale);

  const meshContent = (
    <mesh castShadow receiveShadow>
      <boxGeometry args={fallbackSize} />
      <meshStandardMaterial
        color={fallbackColor}
        roughness={0.4}
        metalness={0.5}
      />
    </mesh>
  );

  if (disableInteraction) {
    return <group scale={scale}>{meshContent}</group>;
  }

  return (
    <group
      ref={groupRef}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      scale={scale}
    >
      {meshContent}
    </group>
  );
}
