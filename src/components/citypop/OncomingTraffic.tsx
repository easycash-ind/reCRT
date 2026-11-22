import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CITY_POP_PALETTE,
  ROAD_CONFIG,
  sampleRoad,
} from "./highwayCurve";
import {
  CityPopGlbInstance,
  type CityPopAssetKey,
} from "./cityPopGlbAssets";

export interface OncomingTrafficProps {
  /** 玩家车辆当前 Z 坐标 */
  carZRef: React.MutableRefObject<number>;
  /** 道路随机种子偏移 */
  seed: number;
}

interface TrafficCarSpec {
  id: number;
  assetKey: CityPopAssetKey;
  baseZOffset: number;
  speed: number;
  tintHex: string;
}

export function OncomingTraffic({ carZRef, seed }: OncomingTrafficProps) {
  const groupRef = useRef<THREE.Group>(null);
  const seedOffset = seed * 0.17;

  const cars = useMemo<TrafficCarSpec[]>(
    () => [
      {
        id: 0,
        assetKey: "userCarZis101",
        baseZOffset: 24,
        speed: 21,
        tintHex: "#FFCC29",
      },
      {
        id: 1,
        assetKey: "userCarRetroA",
        baseZOffset: 78,
        speed: 23,
        tintHex: "#38B6FF",
      },
      {
        id: 2,
        assetKey: "userCarMorgan",
        baseZOffset: 195,
        speed: 24,
        tintHex: "#FF425E",
      },
    ],
    []
  );

  const zPositionsRef = useRef<number[]>(cars.map((c) => c.baseZOffset));

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const playerZ = carZRef.current;
    if (!groupRef.current) return;

    cars.forEach((spec, idx) => {
      let z = zPositionsRef.current[idx] - spec.speed * dt;
      if (z < playerZ - 540) {
        z = playerZ + 545 + idx * 45;
      }
      zPositionsRef.current[idx] = z;

      const s = sampleRoad(z, seedOffset);
      const worldPos = s.position
        .clone()
        .addScaledVector(s.leftNormal, ROAD_CONFIG.leftLaneOffset);

      const child = groupRef.current!.children[idx];
      if (child) {
        child.position.copy(worldPos);
        child.rotation.set(s.pitch, s.yaw, 0, "YXZ");
        // 在远端边界 [470m, 530m] 平滑缩放过渡，防止重生跳变
        const dist = Math.abs(z - playerZ);
        const edgeFade = 1.0 - THREE.MathUtils.smoothstep(dist, 470, 530);
        child.scale.setScalar(Math.max(0.001, edgeFade));
        // 同步驱动对向车辆的四个车轮绕 X 轴高速滚动
        child.traverse((node) => {
          if (node.name && node.name.toLowerCase().includes("wheel")) {
            node.rotation.x -= spec.speed * dt * 0.65;
          }
        });
      }
    });
  });

  return (
    <group ref={groupRef}>
      {cars.map((c) => (
        <group key={c.id}>
          {/* 车底纯黑硬边落影 */}
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.05, 4.35]} />
            <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
          </mesh>
          <CityPopGlbInstance
            assetKey={c.assetKey}
            scale={1.0}
            tintHex={c.tintHex}
          />
        </group>
      ))}
    </group>
  );
}
