import * as THREE from "three";

/**
 * 80s 日系 City Pop 高质感色板（对齐永井博 / 铃木英人 / 渡濑政造原画色调）
 */
export const CITY_POP_PALETTE = {
  skyTop: "#003078",
  skyMid: "#0B58BF",
  skyHorizon: "#5EB5F7",
  horizonMist: "#8BD0FF",
  cloudBright: "#FFFDF6",
  cloudMid: "#E6F2FC",
  cloudShadow: "#9EC0E6",
  cloudInk: "#122036",
  oceanDeep: "#003D8F",
  oceanMid: "#0960BD",
  oceanCyan: "#1D9BF0",
  oceanFoam: "#FFFFFF",
  roadAsphalt: "#D8D3C8",
  roadAsphaltDark: "#C5BFB2",
  roadTrackLine: "#161B26",
  roadYellowLine: "#FFBF18",
  sidewalkPink: "#F2849E",
  sidewalkTileA: "#2AB3E8",
  sidewalkTileB: "#FFFDF7",
  seawallConcrete: "#EFEAE0",
  seawallShadow: "#B8C4D9",
  guardrailBlue: "#2B8EF0",
  guardrailWhite: "#FAF8F2",
  guardrailYellow: "#FFC81E",
  bridgeMint: "#4A9E8A",
  bridgeMintLight: "#7AD0BA",
  bridgeShadow: "#24574B",
  palmTrunkLight: "#7A523E",
  palmTrunkDark: "#2A1B1E",
  palmLeafBright: "#25AD58",
  palmLeafMid: "#137A40",
  palmLeafDark: "#083024",
  islandGreen: "#177048",
  islandLight: "#2CA065",
  islandDark: "#0A362B",
  beachSand: "#FCE8C5",
  inkBlack: "#0E121B",
  coralRed: "#EE4256",
  sunshineYellow: "#FFBD1B",
  cobaltBlue: "#1750D6",
  bubblegumPink: "#F5649D",
  creamWhite: "#FAF5E8",
} as const;

/**
 * 确定性伪随机数生成器 (Mulberry32)
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RoadSample {
  /** 道路中心点世界坐标 */
  position: THREE.Vector3;
  /** 沿 +Z 前进方向的单位切向量 */
  tangent: THREE.Vector3;
  /** 指向道路左侧 (+X 陆地侧) 的水平单位法向量 */
  leftNormal: THREE.Vector3;
  /** 道路水平偏航角 (弧度，绕 Y 轴) */
  yaw: number;
  /** 道路俯仰角 (弧度，绕 X 轴) */
  pitch: number;
  /** 曲率近似值，用于车身过弯侧倾 */
  curvature: number;
}

/**
 * 双行道海滨公路与海面高度基准常量
 */
export const ROAD_CONFIG = {
  /** 路面总宽度（双向两车道 + 两侧路肩） */
  roadWidth: 12.0,
  /** 右侧行车道中心相对于道路中心的横向偏移（临海车道，向 -X 偏移） */
  rightLaneOffset: -2.75,
  /** 左侧行车道中心相对于道路中心的横向偏移（街景车道，向 +X 偏移） */
  leftLaneOffset: 2.75,
  /** 公路防波堤基准海拔（米） */
  baseElevation: 3.4,
  /** 海平面恒定海拔（米），始终低于路面约 4.6m */
  oceanElevation: -1.2,
  /** 单个流式道路区块长度（米） */
  chunkLength: 48,
  /** 同时激活的区块数量（覆盖约 768m 视距） */
  visibleChunks: 16,
} as const;

/**
 * 计算给定 Z 坐标处的道路中心 X 偏移与导数（柔和蜿蜒的海岸 S 弯）
 */
export function evalRoadX(
  z: number,
  seedOffset = 0
): { x: number; dx: number; ddx: number } {
  const s = seedOffset * 13.37;
  const k1 = 0.0068;
  const k2 = 0.0031;
  const A1 = 16.0;
  const A2 = 10.5;

  const p1 = z * k1 + s;
  const p2 = z * k2 - s * 0.7;

  const x = A1 * Math.sin(p1) + A2 * Math.cos(p2);
  const dx = A1 * k1 * Math.cos(p1) - A2 * k2 * Math.sin(p2);
  const ddx = -A1 * k1 * k1 * Math.sin(p1) - A2 * k2 * k2 * Math.cos(p2);

  return { x, dx, ddx };
}

/**
 * 计算给定 Z 坐标处的道路海拔高度 Y 与导数（始终保持在 +2.3m ~ +4.5m 防波堤之上）
 */
export function evalRoadY(
  z: number,
  seedOffset = 0
): { y: number; dy: number } {
  const s = seedOffset * 7.13;
  const k1 = 0.0095;
  const k2 = 0.0044;
  const B1 = 0.68;
  const B2 = 0.42;

  const p1 = z * k1 + s;
  const p2 = z * k2 + s * 0.5;

  const y = ROAD_CONFIG.baseElevation + B1 * Math.sin(p1) + B2 * Math.cos(p2);
  const dy = B1 * k1 * Math.cos(p1) - B2 * k2 * Math.sin(p2);

  return { y, dy };
}

/**
 * 采样道路在指定里程 Z 处的完整几何姿态
 */
export function sampleRoad(z: number, seedOffset = 0): RoadSample {
  const { x, dx, ddx } = evalRoadX(z, seedOffset);
  const { y, dy } = evalRoadY(z, seedOffset);

  const tangent = new THREE.Vector3(dx, dy, 1).normalize();
  // 在右手系 (+X 左, +Y 上, +Z 前) 中，水平前进为 (dx, 0, 1)，指向左侧 (+X) 的水平法向量为 (1, 0, -dx)
  const leftNormal = new THREE.Vector3(1, 0, -dx).normalize();

  const yaw = Math.atan2(dx, 1);
  const pitch = -Math.atan2(dy, Math.hypot(dx, 1));

  return {
    position: new THREE.Vector3(x, y, z),
    tangent,
    leftNormal,
    yaw,
    pitch,
    curvature: ddx,
  };
}
