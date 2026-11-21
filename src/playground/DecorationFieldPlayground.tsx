import { useEffect, useRef, useState, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, type Object3D } from "three";
import { useDecorationControls } from "../hooks/useSceneControls";
import { fixMaterialColorSpace, ensureSmoothNormals } from "../components/GlbModel";

const DECORATION_URL = "/decoration.glb";
const FLOAT_SPEED = 0.6;
const FLOAT_AMP = 0.04;
const ROT_AMP = 0.08;

interface DecoInstance {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  phaseOffset: number;
  rotSpeedFactors: [number, number, number];
}

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateInstances(ctrl: ReturnType<typeof useDecorationControls>): DecoInstance[] {
  const count = Math.round(ctrl.数量);
  if (count <= 0) return [];

  const rng = mulberry32(Math.round(ctrl.随机种子));
  const sMin = ctrl.最小;
  const sMax = ctrl.最大;
  const rMin = ctrl.旋转最小;
  const rMax = ctrl.旋转最大;
  const spX = ctrl.X;
  const spY = ctrl.Y;
  const spZ = ctrl.Z;

  return Array.from({ length: count }, () => ({
    position: [
      (rng() - 0.5) * spX,
      (rng() - 0.5) * spY,
      (rng() - 0.5) * spZ,
    ] as [number, number, number],
    rotation: [
      MathUtils.lerp(rMin, rMax, rng()),
      MathUtils.lerp(rMin, rMax, rng()),
      MathUtils.lerp(rMin, rMax, rng()),
    ] as [number, number, number],
    scale: MathUtils.lerp(sMin, sMax, rng()),
    phaseOffset: rng() * Math.PI * 2,
    rotSpeedFactors: [
      0.1 + rng() * 0.15,
      0.1 + rng() * 0.15,
      0.05 + rng() * 0.1,
    ] as [number, number, number],
  }));
}

export function DecorationFieldPlayground() {
  const ctrl = useDecorationControls();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(DECORATION_URL, { signal: ac.signal })
      .then((res) => {
        const ct = res.headers.get("content-type") ?? "";
        setAvailable(res.ok && !ct.includes("text/html"));
      })
      .catch(() => setAvailable(false));
    return () => ac.abort();
  }, []);

  if (available === null || !available || ctrl.数量 <= 0) return null;

  return <DecorationInstances ctrl={ctrl} />;
}

function DecorationInstances({ ctrl }: { ctrl: ReturnType<typeof useDecorationControls> }) {
  const { scene } = useGLTF(DECORATION_URL);

  const instances = useMemo(
    () => generateInstances(ctrl),
    [ctrl.数量, ctrl.随机种子, ctrl.最小, ctrl.最大, ctrl.旋转最小, ctrl.旋转最大, ctrl.X, ctrl.Y, ctrl.Z],
  );

  const clones = useMemo(() => {
    return instances.map(() => {
      const c = scene.clone();
      fixMaterialColorSpace(c);
      ensureSmoothNormals(c);
      return c;
    });
  }, [scene, instances]);

  return (
    <>
      {clones.map((clone, i) => (
        <DecoClone key={i} clonedScene={clone} instance={instances[i]} />
      ))}
    </>
  );
}

function DecoClone({ clonedScene, instance }: { clonedScene: Object3D; instance: DecoInstance }) {
  const groupRef = useRef<Group>(null);
  const { position, rotation, scale, phaseOffset, rotSpeedFactors } = instance;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime() * FLOAT_SPEED;
    const p = phaseOffset;

    groupRef.current.position.x = position[0] + Math.sin(t + p) * FLOAT_AMP;
    groupRef.current.position.y = position[1] + Math.sin(t * 1.3 + p + 1.0) * FLOAT_AMP;
    groupRef.current.position.z = position[2] + Math.sin(t * 0.7 + p + 2.0) * FLOAT_AMP * 0.5;

    groupRef.current.rotation.x = rotation[0] + Math.sin(t * rotSpeedFactors[0] + p) * ROT_AMP;
    groupRef.current.rotation.y = rotation[1] + Math.sin(t * rotSpeedFactors[1] + p + 1.0) * ROT_AMP;
    groupRef.current.rotation.z = rotation[2] + Math.sin(t * rotSpeedFactors[2] + p + 2.0) * ROT_AMP;
  });

  return (
    <group ref={groupRef} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}
