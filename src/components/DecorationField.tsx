import { useEffect, useRef, useState, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, type Object3D } from "three";
import { LOGIN_SCENE_DECORATION } from "../constants";
import { fixMaterialColorSpace, ensureSmoothNormals } from "./GlbModel";

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

function generateInstances(): DecoInstance[] {
  const count = LOGIN_SCENE_DECORATION.count;
  if (count <= 0) return [];

  const rng = mulberry32(LOGIN_SCENE_DECORATION.seed);
  const sMin = LOGIN_SCENE_DECORATION.minScale;
  const sMax = LOGIN_SCENE_DECORATION.maxScale;
  const rMin = LOGIN_SCENE_DECORATION.minRotation;
  const rMax = LOGIN_SCENE_DECORATION.maxRotation;
  const spX = LOGIN_SCENE_DECORATION.rangeX;
  const spY = LOGIN_SCENE_DECORATION.rangeY;
  const spZ = LOGIN_SCENE_DECORATION.rangeZ;

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

export function DecorationField() {
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

  if (available === null || !available || LOGIN_SCENE_DECORATION.count <= 0) return null;

  return <DecorationInstances />;
}

function DecorationInstances() {
  const { scene } = useGLTF(DECORATION_URL);

  const instances = useMemo(() => generateInstances(), []);

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
