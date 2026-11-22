import { useMemo } from "react";
import * as THREE from "three";
import {
  CITY_POP_PALETTE,
  ROAD_CONFIG,
  createSeededRandom,
  sampleRoad,
} from "./highwayCurve";
import {
  type CityPopSignVariant,
  applyCityPopDistanceFade,
  getCityPopCelLitMaterial,
  getCityPopMeadowHillMaterial,
  getCityPopPalmShadowTexture,
  getCityPopRoadTexture,
  getCityPopSeawallMaterial,
  getCityPopSignTexture,
  getSidewalkTileTexture,
  getUniformInkOutlineMaterial,
} from "./cityPopShaders";
import {
  CityPopGlbInstance,
  type CityPopAssetKey,
} from "./cityPopGlbAssets";

const SIGN_VARIANTS: CityPopSignVariant[] = [
  "pacific",
  "shop",
  "mall",
  "diner",
  "yacht",
  "coast",
  "mart",
  "stereo",
];

const BUILDING_ASSETS: CityPopAssetKey[] = [
  "userCityBldg1",
  "userCityBldg2",
  "userCityBldg3",
  "userSfBldg1",
  "userSfBldg2",
  "skyscraperA",
  "skyscraperB",
  "skyscraperC",
];

/**
 * 各建筑模型归一化后的精确半宽 (halfX: 垂直道路方向) 与半深 (halfZ: 沿道路方向)，
 * 用于对齐建筑临街立面、将悬挂霓虹招牌精确贴合在建筑前外墙表面、并防止相邻建筑或广告牌穿模
 */
const BUILDING_HALF_EXTENTS: Partial<
  Record<CityPopAssetKey, { halfX: number; halfZ: number }>
> = {
  userCityBldg1: { halfX: 7.59, halfZ: 5.24 },
  userCityBldg2: { halfX: 9.89, halfZ: 16.01 },
  userCityBldg3: { halfX: 12.95, halfZ: 8.93 },
  userSfBldg1: { halfX: 4.67, halfZ: 4.67 },
  userSfBldg2: { halfX: 3.23, halfZ: 3.48 },
  skyscraperA: { halfX: 7.29, halfZ: 7.83 },
  skyscraperB: { halfX: 6.75, halfZ: 7.29 },
  skyscraperC: { halfX: 8.1, halfZ: 8.37 },
};

const BILLBOARD_ASSETS: CityPopAssetKey[] = [
  "userBillboardTrussLarge",
  "userBillboardFrameMed",
  "userBillboardLitMarquee",
];

const STREET_PROP_ASSETS: CityPopAssetKey[] = [
  "userPropBusStop",
  "userPropSidewalkCluster",
  "userPropBenchUtility",
];

const ROAD_SIGN_VARIANTS: CityPopAssetKey[] = [
  "userRoadSignSingle",
  "userRoadSignTwinWing",
];

/**
 * 构建沿 sampleRoad(z) 弯曲的水平条带 BufferGeometry
 * 法线严格朝向 +Y
 */
function buildRoadRibbonGeometry(
  zStart: number,
  zEnd: number,
  segments: number,
  offsetLeftA: number,
  offsetLeftB: number,
  yOffset: number,
  seedOffset: number,
  uvRepeatZ = 4,
  useFixedOceanY = false
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    const s = sampleRoad(z, seedOffset);

    const pA = s.position.clone().addScaledVector(s.leftNormal, offsetLeftA);
    const pB = s.position.clone().addScaledVector(s.leftNormal, offsetLeftB);

    if (useFixedOceanY) {
      pA.y = ROAD_CONFIG.oceanElevation + yOffset;
      pB.y = ROAD_CONFIG.oceanElevation + yOffset;
    } else {
      pA.y += yOffset;
      pB.y += yOffset;
    }

    positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t * uvRepeatZ, 1, t * uvRepeatZ);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/**
 * 构建公路右侧竖直向下的混凝土防波堤立面几何体
 */
function buildSeawallVerticalGeometry(
  zStart: number,
  zEnd: number,
  segments: number,
  lateralOffset: number,
  seedOffset: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    const s = sampleRoad(z, seedOffset);

    const pTop = s.position
      .clone()
      .addScaledVector(s.leftNormal, lateralOffset);
    pTop.y += 0.22;

    const pBot = pTop.clone();
    pBot.y = ROAD_CONFIG.oceanElevation - 0.5;

    positions.push(pTop.x, pTop.y, pTop.z, pBot.x, pBot.y, pBot.z);
    normals.push(-s.leftNormal.x, 0, -s.leftNormal.z);
    normals.push(-s.leftNormal.x, 0, -s.leftNormal.z);
    uvs.push(t * 4, 1, t * 4, 0);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/**
 * 构建海边郊区左侧多维起伏 3D 阳光草坪丘陵几何体（24 x 10 网格，含波浪形山包隆起与精确法线）
 */
function buildSuburbanSlopeGeometry(
  zStart: number,
  zEnd: number,
  segments: number,
  offsetLeftA: number,
  offsetLeftB: number,
  yRise: number,
  seedOffset: number,
  fadeStart = false,
  fadeEnd = false
): THREE.BufferGeometry {
  const lateralSteps = 10;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const tz = i / segments;
    const z = THREE.MathUtils.lerp(zStart, zEnd, tz);
    const s = sampleRoad(z, seedOffset);

    const startEnv = fadeStart ? THREE.MathUtils.smoothstep(tz, 0.0, 0.55) : 1.0;
    const endEnv = fadeEnd ? 1.0 - THREE.MathUtils.smoothstep(tz, 0.45, 1.0) : 1.0;
    const longitudinalEnv = startEnv * endEnv;

    for (let j = 0; j <= lateralSteps; j++) {
      const u = j / lateralSteps; // 0 = 路肩草丛边缘, 1 = 远端丘陵山脊
      const lateral = THREE.MathUtils.lerp(offsetLeftA, offsetLeftB, u);
      const p = s.position.clone().addScaledVector(s.leftNormal, lateral);

      // S 型柔和抬升曲线 + 纵横交错的自然草包丘陵起伏
      const smoothProfile = Math.pow(u, 0.85) * (1.0 - 0.18 * Math.pow(u, 2));
      const mound1 =
        Math.sin(z * 0.065 + u * 2.8 + seedOffset) *
        1.85 *
        Math.sin(u * Math.PI);
      const mound2 =
        Math.cos(z * 0.12 - u * 4.2 + seedOffset * 1.7) *
        0.85 *
        Math.sin(u * Math.PI);

      p.y += 0.14 + (smoothProfile * yRise + mound1 + mound2) * longitudinalEnv;

      positions.push(p.x, p.y, p.z);
      uvs.push(u, tz * 2);
    }
  }

  const rowStride = lateralSteps + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < lateralSteps; j++) {
      const a = i * rowStride + j;
      const b = a + 1;
      const c = (i + 1) * rowStride + j;
      const d = c + 1;
      // 保持法线严格朝向 +Y 左上方
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 铃木英人参考图 2 & 图 3 风格的高耸公路路边立柱招牌塔 (Roadside Pylon Sign)
 * - style="american": 双天蓝钢柱 + 顶层明黄皇冠牌 + 中层 AMERICAN 梯形大灯箱 + 底层绿色 Restaurant 标牌（参考图 2）
 * - style="motel": 单粗白立柱 + 顶层大红 MOTEL 灯箱 + 青色欢迎牌 + 黑色 VACANCY 牌（参考图 3）
 */
function RoadsidePylonSign({
  position,
  yaw,
  style = "american",
}: {
  position: [number, number, number];
  yaw: number;
  style?: "american" | "motel";
}) {
  const mainTex = useMemo(
    () => getCityPopSignTexture(style === "american" ? "american_inn" : "motel"),
    [style]
  );

  const outlineMat = useMemo(() => getUniformInkOutlineMaterial(), []);

  if (style === "american") {
    return (
      <group position={position} rotation={[0, yaw, 0]}>
        {/* 双天蓝钢结构立柱（带四阶色彩分层光影与恒定像素外轮廓描边） */}
        {[-1.35, 1.35].map((px, idx) => (
          <group key={idx} position={[px, 6.2, 0]}>
            <mesh material={getCityPopCelLitMaterial("#2994E8")}>
              <cylinderGeometry args={[0.16, 0.22, 12.4, 8]} />
            </mesh>
            <mesh material={outlineMat}>
              <cylinderGeometry args={[0.16, 0.22, 12.4, 8]} />
            </mesh>
          </group>
        ))}

        {/* 顶层明黄色 Best Western 方牌 + 红色皇冠饰顶 */}
        <group position={[0, 11.4, 0]}>
          <mesh material={getCityPopCelLitMaterial("#FFCC1B")}>
            <boxGeometry args={[3.4, 2.1, 0.42]} />
          </mesh>
          <mesh material={outlineMat}>
            <boxGeometry args={[3.4, 2.1, 0.42]} />
          </mesh>
          <mesh position={[0, 1.45, 0]} material={getCityPopCelLitMaterial("#EE4256")}>
            <coneGeometry args={[0.95, 0.9, 5]} />
          </mesh>
          <mesh position={[0, 1.45, 0]} material={outlineMat}>
            <coneGeometry args={[0.95, 0.9, 5]} />
          </mesh>
        </group>

        {/* 中层 AMERICAN MOTOR INN 主灯箱 */}
        <group position={[0, 8.2, 0]}>
          <mesh>
            <boxGeometry args={[6.2, 2.6, 0.48]} />
            <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
          </mesh>
          <mesh position={[0, 0, 0.26]}>
            <planeGeometry args={[5.9, 2.35]} />
            <meshBasicMaterial map={mainTex} />
          </mesh>
          <mesh position={[0, 0, -0.26]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[5.9, 2.35]} />
            <meshBasicMaterial map={mainTex} />
          </mesh>
        </group>

        {/* 下层复古松石绿 Restaurant 横牌 */}
        <group position={[0, 5.4, 0]}>
          <mesh material={getCityPopCelLitMaterial("#2E7D5B")}>
            <boxGeometry args={[4.2, 0.95, 0.38]} />
          </mesh>
          <mesh material={outlineMat}>
            <boxGeometry args={[4.2, 0.95, 0.38]} />
          </mesh>
        </group>
      </group>
    );
  }

  // 参考图 3：单白柱 + 红底 MOTEL + 青白信息板 + 黑底 VACANCY（全组件挂载四阶色彩分层光影与恒定像素墨线描边）
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group position={[0, 5.8, 0]}>
        <mesh material={getCityPopCelLitMaterial("#DCECF8")}>
          <cylinderGeometry args={[0.22, 0.26, 11.6, 10]} />
        </mesh>
        <mesh material={outlineMat}>
          <cylinderGeometry args={[0.22, 0.26, 11.6, 10]} />
        </mesh>
      </group>
      {/* 顶层大红 MOTEL 灯箱 */}
      <group position={[0, 9.8, 0]}>
        <mesh>
          <boxGeometry args={[5.4, 2.2, 0.48]} />
          <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
        </mesh>
        <mesh position={[0, 0, 0.26]}>
          <planeGeometry args={[5.15, 1.98]} />
          <meshBasicMaterial map={mainTex} />
        </mesh>
        <mesh position={[0, 0, -0.26]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[5.15, 1.98]} />
          <meshBasicMaterial map={mainTex} />
        </mesh>
      </group>
      {/* 中层天青色信息牌（带四阶色彩分层与外轮廓墨线） */}
      <group position={[0, 7.5, 0]}>
        <mesh material={getCityPopCelLitMaterial("#9BD6FA")}>
          <boxGeometry args={[3.8, 1.55, 0.36]} />
        </mesh>
        <mesh material={outlineMat}>
          <boxGeometry args={[3.8, 1.55, 0.36]} />
        </mesh>
      </group>
      {/* 下层明黄底 VACANCY 灯牌 */}
      <group position={[0, 5.9, 0]}>
        <mesh material={getCityPopCelLitMaterial("#FFD026")}>
          <boxGeometry args={[2.9, 0.68, 0.36]} />
        </mesh>
        <mesh material={outlineMat}>
          <boxGeometry args={[2.9, 0.68, 0.36]} />
        </mesh>
      </group>
      {/* 底层珊瑚粉 COMMERCIAL RATES 牌 */}
      <group position={[0, 4.8, 0]}>
        <mesh material={getCityPopCelLitMaterial("#FF7A98")}>
          <boxGeometry args={[2.7, 0.88, 0.34]} />
        </mesh>
        <mesh material={outlineMat}>
          <boxGeometry args={[2.7, 0.88, 0.34]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 铃木英人参考图 3 风格的独栋海边路边店 / 汽车旅馆 (Happy Moments MOTEL)
 * 包含平顶白墙独栋建筑 + 复古百叶深蓝窗 + 暖橙木门 + 路边高耸 MOTEL 立柱招牌 + 后排高挑细棕榈树群 + 门前停靠的红色复古跑车
 */
function SuburbanRoadsideMotel({
  position,
  yaw,
}: {
  position: [number, number, number];
  yaw: number;
}) {
  const happyTex = useMemo(() => getCityPopSignTexture("happy_moments"), []);

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* 门前碎石停车坪 */}
      <mesh position={[-3.5, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12.0, 22.0]} />
        <meshBasicMaterial color="#D8CFC2" />
      </mesh>

      {/* Blender 5.1 写实 1:1 比例平顶白墙独栋 Motel 主体（含挑空廊柱、百叶窗、空调外机与结构边线） */}
      <group position={[2.5, 0, 0]}>
        <CityPopGlbInstance assetKey="suburbanMotel" scale={1.0} />

        {/* 面向公路 (-X) 的屋顶 Happy Moments MOTEL 招牌条 */}
        <mesh position={[-4.35, 5.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[13.5, 2.1]} />
          <meshBasicMaterial map={happyTex} />
        </mesh>
      </group>

      {/* 门前停靠的一辆 2022 Morgan Plus Six 复古敞篷跑车 + 街头长椅/邮筒小零件 */}
      <group position={[-4.8, 0.05, -2.6]} rotation={[0, 0.25, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.1, 4.4]} />
          <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
        </mesh>
        <CityPopGlbInstance
          assetKey="userCarMorgan"
          scale={1.0}
          tintHex="#EE3344"
        />
      </group>
      <CityPopGlbInstance
        assetKey="userPropSidewalkCluster"
        position={[-1.8, 0.05, 6.2]}
        rotation={[0, 0, 0]}
        scale={1.0}
      />

      {/* 路边高耸的红白 MOTEL / VACANCY 立柱招牌（参考图 3 右侧） */}
      <RoadsidePylonSign
        position={[-5.2, 0, 8.5]}
        yaw={-Math.PI / 2 + 0.25}
        style="motel"
      />

      {/* 旅馆后方成排的高挑细长海滨棕榈树（复刻参考图 3 背景，1:1 真实米制比例） */}
      {[-6.5, -2.0, 2.5, 7.0].map((zOff, idx) => (
        <CityPopGlbInstance
          key={idx}
          assetKey="palmTall"
          position={[8.2 + (idx % 2) * 1.5, 0, zOff]}
          rotation={[0, idx * 1.2, 0]}
          scale={0.95 + (idx % 3) * 0.12}
        />
      ))}
    </group>
  );
}

/**
 * 渡濑政造参考图 5 标志性的薄荷绿海湾系杆拱桥（Tied-Arch Coastal Bridge）
 */
function CoastalTiedArchBridge({
  zCenter,
  seedOffset,
}: {
  zCenter: number;
  seedOffset: number;
}) {
  const sample = useMemo(
    () => sampleRoad(zCenter, seedOffset),
    [zCenter, seedOffset]
  );

  const archSpan = 38;
  const archHeight = 17.5;
  const segments = 18;

  const hangers = useMemo(() => {
    const items: Array<{ zLocal: number; h: number }> = [];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const zLocal = (t - 0.5) * archSpan;
      const normalized = 1 - Math.pow((t - 0.5) * 2, 2);
      const h = normalized * archHeight;
      items.push({ zLocal, h });
    }
    return items;
  }, [archSpan, archHeight]);

  return (
    <group
      position={[sample.position.x, sample.position.y, sample.position.z]}
      rotation={[0, sample.yaw, 0]}
    >
      {[-6.8, 6.8].map((xSide, sideIdx) => (
        <group key={sideIdx} position={[xSide, 0, 0]}>
          {Array.from({ length: segments }).map((_, i) => {
            const t0 = i / segments;
            const t1 = (i + 1) / segments;
            const z0 = (t0 - 0.5) * archSpan;
            const z1 = (t1 - 0.5) * archSpan;
            const y0 = (1 - Math.pow((t0 - 0.5) * 2, 2)) * archHeight;
            const y1 = (1 - Math.pow((t1 - 0.5) * 2, 2)) * archHeight;
            const midZ = (z0 + z1) * 0.5;
            const midY = (y0 + y1) * 0.5;
            const len = Math.hypot(z1 - z0, y1 - y0);
            const pitch = Math.atan2(y1 - y0, z1 - z0);

            return (
              <group
                key={i}
                position={[0, midY, midZ]}
                rotation={[-pitch, 0, 0]}
              >
                <mesh material={getCityPopCelLitMaterial(CITY_POP_PALETTE.bridgeMint)}>
                  <boxGeometry args={[0.92, 1.15, len + 0.14]} />
                </mesh>
                <mesh material={getUniformInkOutlineMaterial()}>
                  <boxGeometry args={[0.92, 1.15, len + 0.14]} />
                </mesh>
                <mesh
                  position={[0.24, 0.12, 0]}
                  material={getCityPopCelLitMaterial(CITY_POP_PALETTE.bridgeMintLight)}
                >
                  <boxGeometry args={[0.5, 0.9, len + 0.12]} />
                </mesh>
              </group>
            );
          })}

          {hangers.map((hg, hIdx) => (
            <mesh key={hIdx} position={[0, hg.h * 0.5, hg.zLocal]}>
              <cylinderGeometry args={[0.045, 0.045, hg.h, 6]} />
              <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
            </mesh>
          ))}
        </group>
      ))}

      <group position={[0, archHeight * 0.92, 0]}>
        <mesh material={getCityPopCelLitMaterial(CITY_POP_PALETTE.bridgeMint)}>
          <boxGeometry args={[14.4, 0.95, 1.35]} />
        </mesh>
        <mesh material={getUniformInkOutlineMaterial()}>
          <boxGeometry args={[14.4, 0.95, 1.35]} />
        </mesh>
        <mesh position={[0, -0.2, 0.72]}>
          <planeGeometry args={[7.2, 1.75]} />
          <meshBasicMaterial map={getCityPopSignTexture("coast")} />
        </mesh>
      </group>
    </group>
  );
}

interface CoastChunkProps {
  chunkIndex: number;
  seed: number;
  oceanMaterial: THREE.ShaderMaterial;
  timeOfDay: "noon" | "sunset";
}

/**
 * 单个 48m 海岸公路流式区块（全部景观元素均采用预加载的 3D GLB 资产实例）
 */
function CoastlineChunk({
  chunkIndex,
  seed,
  oceanMaterial,
  timeOfDay,
}: CoastChunkProps) {
  const zStart = chunkIndex * ROAD_CONFIG.chunkLength;
  const zEnd = zStart + ROAD_CONFIG.chunkLength;
  const seedOffset = seed * 0.17;

  // 7 区块交替周期：3 个区块繁华海滨商业街 <-> 4 个区块铃木英人式开阔海边郊区
  const cycleMod = (((chunkIndex + seed + 3) % 7) + 7) % 7;
  const isSuburban = cycleMod >= 3;

  const roadTex = useMemo(() => getCityPopRoadTexture(), []);
  const sidewalkTex = useMemo(() => getSidewalkTileTexture(), []);
  const meadowHillMat = useMemo(() => getCityPopMeadowHillMaterial(), []);
  const seawallMat = useMemo(() => getCityPopSeawallMaterial(), []);
  const isSunset = timeOfDay === "sunset";
  const palmShadowMat = useMemo(() => {
    const tex = getCityPopPalmShadowTexture();
    return applyCityPopDistanceFade(
      new THREE.MeshBasicMaterial({
        map: tex,
        color: isSunset ? "#5E2B6E" : "#FFFFFF",
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        fog: false,
      })
    );
  }, [isSunset]);

  // 构建弯曲道路、步道/郊区草坡、防波堤与曲线海湾几何体
  const geometries = useMemo(() => {
    const segs = 24;
    const halfW = ROAD_CONFIG.roadWidth * 0.5; // 6.0m
    const seawallOuter = -halfW - 1.15; // -7.15m

    const oceanGeo = buildRoadRibbonGeometry(
      zStart,
      zEnd,
      segs,
      -380.0,
      seawallOuter,
      0,
      seedOffset,
      1,
      true
    );
    const uvAttr = oceanGeo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setX(i, 1.0 - uvAttr.getX(i));
    }
    uvAttr.needsUpdate = true;

    return {
      asphalt: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        -halfW,
        halfW,
        0,
        seedOffset,
        3
      ),
      pinkSidewalk: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        halfW,
        halfW + 8.5,
        0.14,
        seedOffset,
        6
      ),
      landPlot: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        halfW + 8.5,
        halfW + 120.0,
        0.18,
        seedOffset,
        2
      ),
      // 郊区路边砂石路肩 + 兜底绿地 + 首尾平滑衔接的翠绿阳光缓坡草甸
      suburbGravelShoulder: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        halfW,
        halfW + 3.2,
        0.08,
        seedOffset,
        4
      ),
      suburbBaseGround: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        halfW + 3.2,
        halfW + 120.0,
        0.06,
        seedOffset,
        2
      ),
      suburbGrassSlope: buildSuburbanSlopeGeometry(
        zStart,
        zEnd,
        segs,
        halfW + 3.2,
        halfW + 120.0,
        7.4,
        seedOffset,
        cycleMod === 3,
        cycleMod === 6
      ),
      seawallCap: buildRoadRibbonGeometry(
        zStart,
        zEnd,
        segs,
        seawallOuter,
        -halfW,
        0.18,
        seedOffset,
        4
      ),
      seawallFace: buildSeawallVerticalGeometry(
        zStart,
        zEnd,
        segs,
        seawallOuter,
        seedOffset
      ),
      oceanRibbon: oceanGeo,
    };
  }, [zStart, zEnd, seedOffset]);

  // 基于区块索引与种子的确定性随机 GLB 资产排布
  const chunkProps = useMemo(() => {
    const rng = createSeededRandom(chunkIndex * 7919 + seed * 104729 + 17);
    const halfW = ROAD_CONFIG.roadWidth * 0.5;

    // 1. Blender 5.1 写实 1:1 比例修长高杆鹅颈公路路灯（仅布置在陆侧 +X，保持海侧 -X 视野完全开阔无遮挡）
    const lights: Array<{
      pos: [number, number, number];
      rotY: number;
      assetKey: CityPopAssetKey;
    }> = [];
    for (let i = 0; i < 2; i++) {
      const z = zStart + (i + 0.25) * (ROAD_CONFIG.chunkLength / 2);
      const s = sampleRoad(z, seedOffset);

      // 陆侧 (+X) 人行道/路肩鹅颈路灯
      const pLeft = s.position
        .clone()
        .addScaledVector(s.leftNormal, halfW + 0.85);
      lights.push({
        pos: [pLeft.x, pLeft.y + 0.14, pLeft.z],
        rotY: s.yaw,
        assetKey: isSuburban ? "lightCurved" : "lightCurvedDouble",
      });
    }

    // 3. 陆侧 (+X) 永井博《Vermeerist BEAMS》风格极修长羽状棕榈树 (1:1 真实米制比例)
    const palms: Array<{
      pos: [number, number, number];
      scale: number;
      yaw: number;
      assetKey: CityPopAssetKey;
      hasBush: boolean;
      hasParasol: boolean;
    }> = [];
    const palmCount = 4;
    for (let i = 0; i < palmCount; i++) {
      const z =
        zStart +
        (i + 0.18 + rng() * 0.5) * (ROAD_CONFIG.chunkLength / palmCount);
      const s = sampleRoad(z, seedOffset);
      const lateral = halfW + 2.8 + rng() * 2.8;
      const p = s.position.clone().addScaledVector(s.leftNormal, lateral);
      palms.push({
        pos: [p.x, p.y + 0.14, p.z],
        scale: 0.88 + rng() * 0.28,
        yaw: rng() * Math.PI * 2,
        assetKey: rng() > 0.45 ? "palmBend" : "palmStraight",
        hasBush: rng() > 0.3,
        hasParasol: !isSuburban && i % 2 === 1 && rng() > 0.35,
      });
    }

    // 4. 陆侧 (+X) Blender 5.1 写实 1:1 比例 80s 现代主义海景酒店塔楼与转角商业大厦
    const buildings: Array<{
      pos: [number, number, number];
      yaw: number;
      scale: [number, number, number];
      assetKey: CityPopAssetKey;
      tintHex: string;
      signVariant: CityPopSignVariant;
      halfX: number;
      halfZ: number;
    }> = [];

    const bCount = 2;
    const tintPalette = ["#FFFFFF", "#E0F2FF", "#FFE3F0", "#FFF6D6", "#D2EDFF"];

    for (let i = 0; i < bCount; i++) {
      const z = zStart + (i + 0.5) * (ROAD_CONFIG.chunkLength / bCount);
      const s = sampleRoad(z, seedOffset);
      const assetKey =
        BUILDING_ASSETS[Math.floor(rng() * BUILDING_ASSETS.length)];
      const ext = BUILDING_HALF_EXTENTS[assetKey] ?? {
        halfX: 7.5,
        halfZ: 7.5,
      };
      const sx = 0.95 + rng() * 0.18;
      const sy = 0.92 + rng() * 0.28;
      // 限制单栋建筑沿道路 Z 方向最大占地不超过 18.0m（单槽位 24m），确保相邻建筑与招牌之间至少留出 6m 街道间隙
      const rawSz = 0.95 + rng() * 0.18;
      const sz = Math.min(rawSz, 9.0 / ext.halfZ);
      // 将建筑临街前立面 (-halfX * sx) 严格对齐在人行道外侧绿地退界线上 (halfW + 9.8m ~ 11.2m)，杜绝宽体大厦侵入步道或吞没招牌
      const frontWallLateral = halfW + 9.8 + rng() * 1.4;
      const lateral = frontWallLateral + ext.halfX * sx;
      const p = s.position.clone().addScaledVector(s.leftNormal, lateral);

      buildings.push({
        pos: [p.x, p.y + 0.16, p.z],
        yaw: s.yaw,
        scale: [sx, sy, sz],
        assetKey,
        tintHex: tintPalette[Math.floor(rng() * tintPalette.length)],
        signVariant: SIGN_VARIANTS[(Math.abs(chunkIndex * 2 + i) + seed) % SIGN_VARIANTS.length],
        halfX: ext.halfX,
        halfZ: ext.halfZ,
      });
    }

    const mod5 = ((chunkIndex % 5) + 5) % 5;
    const mod3 = ((chunkIndex % 3) + 3) % 3;
    const hasArchBridge = !isSuburban && mod5 === 2;
    const hasRoadSign = mod3 === 1 && !hasArchBridge;
    const roadSignSample = hasRoadSign
      ? sampleRoad(zStart + ROAD_CONFIG.chunkLength * 0.5, seedOffset)
      : null;
    const roadSignKey =
      ROAD_SIGN_VARIANTS[Math.abs(chunkIndex + seed) % ROAD_SIGN_VARIANTS.length];

    // 5. 海边郊区专属景观：疏朗高挑细棕榈 + 偶发路边店 (Motel) 或双柱高耸公路招牌塔 (Pylon Sign)
    const suburbanCenterSample = isSuburban
      ? sampleRoad(zStart + ROAD_CONFIG.chunkLength * 0.5, seedOffset)
      : null;

    let suburbanFeature: "none" | "motel" | "pylon" = "none";
    if (isSuburban) {
      if (cycleMod === 4 && rng() > 0.25) {
        suburbanFeature = "motel";
      } else if (cycleMod === 5 && rng() > 0.2) {
        suburbanFeature = "pylon";
      }
    }

    const suburbanFeaturePos = suburbanCenterSample
      ? suburbanCenterSample.position
          .clone()
          .addScaledVector(suburbanCenterSample.leftNormal, halfW + 9.2)
      : null;

    // 6. 商业街人行道「城市小零件」簇 (BusStop / ATM / 邮筒 / 消防栓 / 长椅) 与开阔郊区独立大型户外广告牌
    const streetPropSample = sampleRoad(
      zStart + ROAD_CONFIG.chunkLength * 0.32,
      seedOffset
    );
    const streetPropPos = streetPropSample.position
      .clone()
      .addScaledVector(streetPropSample.leftNormal, halfW + 3.2);
    const streetPropKey =
      STREET_PROP_ASSETS[Math.abs(chunkIndex * 3 + seed) % STREET_PROP_ASSETS.length];

    // 大型钢结构落地广告牌仅布置在无建筑、无 Motel、无高塔立柱牌的开阔郊区缓坡路段，彻底杜绝与建筑或其他广告牌穿模
    const hasLargeBillboard = isSuburban && suburbanFeature === "none";
    const billboardSample = sampleRoad(
      zStart + ROAD_CONFIG.chunkLength * 0.5,
      seedOffset
    );
    const billboardPos = billboardSample.position
      .clone()
      .addScaledVector(billboardSample.leftNormal, halfW + 13.5);
    const billboardKey =
      BILLBOARD_ASSETS[Math.abs(chunkIndex * 5 + seed) % BILLBOARD_ASSETS.length];

    return {
      lights: isSuburban ? lights.slice(0, 1) : lights,
      palms,
      buildings: isSuburban ? [] : buildings,
      hasArchBridge,
      hasRoadSign,
      roadSignSample,
      roadSignKey,
      streetPropPos: [
        streetPropPos.x,
        streetPropPos.y + 0.14,
        streetPropPos.z,
      ] as [number, number, number],
      streetPropYaw: streetPropSample.yaw,
      streetPropKey,
      hasLargeBillboard,
      billboardPos: [
        billboardPos.x,
        billboardPos.y + 0.05,
        billboardPos.z,
      ] as [number, number, number],
      billboardYaw: billboardSample.yaw - 0.32,
      billboardKey,
      suburbanFeature,
      suburbanFeaturePos: suburbanFeaturePos
        ? ([
            suburbanFeaturePos.x,
            suburbanFeaturePos.y + 0.12,
            suburbanFeaturePos.z,
          ] as [number, number, number])
        : null,
      suburbanYaw: suburbanCenterSample ? suburbanCenterSample.yaw : 0,
    };
  }, [chunkIndex, seed, zStart, seedOffset, isSuburban, cycleMod]);

  return (
    <group>
      {/* 1. 曲线海湾水面 */}
      <mesh geometry={geometries.oceanRibbon} material={oceanMaterial} />

      {/* 2. 竖直混凝土防波堤立面与堤顶压石（无右侧栏杆，保持海侧路肩开阔通透） */}
      <mesh geometry={geometries.seawallFace} material={seawallMat} />
      <mesh geometry={geometries.seawallCap}>
        <meshBasicMaterial color={isSunset ? "#2A1A2E" : "#3A2C2F"} />
      </mesh>

      {/* 3. 双行道高质感丝网版画颗粒沥青马路 */}
      <mesh geometry={geometries.asphalt}>
        <meshBasicMaterial
          map={roadTex}
          color={isSunset ? "#F7C5A8" : "#FFFFFF"}
        />
      </mesh>

      {/* 4. 左侧地形：商业街采用珊瑚粉棋盘格步道，海边郊区采用深褐碎石路肩 + 铃木英人式分层翠绿缓坡草甸（参考图 1 & 2） */}
      {isSuburban ? (
        <>
          <mesh geometry={geometries.suburbGravelShoulder}>
            <meshBasicMaterial color={isSunset ? "#2E1C2E" : "#3E2E31"} />
          </mesh>
          <mesh geometry={geometries.suburbBaseGround} material={meadowHillMat} />
          <mesh
            geometry={geometries.suburbGrassSlope}
            material={meadowHillMat}
          />
        </>
      ) : (
        <>
          <mesh geometry={geometries.pinkSidewalk}>
            <meshBasicMaterial
              map={sidewalkTex}
              color={isSunset ? "#FFB39E" : "#FFFFFF"}
            />
          </mesh>
          <mesh geometry={geometries.landPlot} material={meadowHillMat} />
        </>
      )}

      {/* 5. 写实 1:1 比例高杆鹅颈公路路灯（仅陆侧） */}
      {chunkProps.lights.map((lt, idx) => (
        <CityPopGlbInstance
          key={idx}
          assetKey={lt.assetKey}
          position={lt.pos}
          rotation={[0, lt.rotY, 0]}
          scale={1.0}
        />
      ))}

      {/* 6. 真实 3D GLB 棕榈树、带羽状树冠的半透明冷蓝投影、热带灌木绿化与海滩遮阳伞 */}
      {chunkProps.palms.map((p, idx) => (
        <group key={idx} position={p.pos}>
          {/* 树底根部 + 树干 + 放射状羽叶树冠的半透明群青蓝硬边投影（透出下方人行道地砖纹理） */}
          <mesh
            position={[-3.45 * p.scale, 0.015, 0.45 * p.scale]}
            rotation={[-Math.PI / 2, 0, -0.13]}
            material={palmShadowMat}
          >
            <planeGeometry args={[9.2 * p.scale, 4.6 * p.scale]} />
          </mesh>
          <CityPopGlbInstance
            assetKey={p.assetKey}
            rotation={[0, p.yaw, 0]}
            scale={p.scale}
            frondVariant={Math.abs(chunkIndex * 5 + idx * 3 + seed) % 6}
          />
          {p.hasBush && (
            <CityPopGlbInstance
              assetKey="bushDetailed"
              position={[0.6, 0.05, 0.4]}
              scale={2.8}
            />
          )}
          {p.hasParasol && (
            <CityPopGlbInstance
              assetKey="parasolA"
              position={[-1.4, 0, 2.2]}
              rotation={[0, p.yaw * 0.5, 0]}
              scale={6.2}
              tintHex="#FF5C8A"
            />
          )}
        </group>
      ))}

      {/* 8. 商业街：写实 80s 现代主义海景酒店与商业大厦 + 精确贴合在建筑前外墙表面的临街霓虹招牌 */}
      {chunkProps.buildings.map((b, idx) => {
        const signTex = getCityPopSignTexture(b.signVariant);
        const signW = Math.min(7.2, b.halfZ * 2 * b.scale[2] * 0.76);
        const signH = signW * 0.44;
        const signX = -(b.halfX * b.scale[0] + 0.36);
        const signY = idx === 0 ? 7.8 : 9.8;
        return (
          <group key={idx} position={b.pos} rotation={[0, b.yaw, 0]}>
            <CityPopGlbInstance
              assetKey={b.assetKey}
              scale={b.scale}
              tintHex={b.tintHex}
            />
            <group
              position={[signX, signY, 0]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <mesh>
                <boxGeometry args={[signW, signH, 0.42]} />
                <meshBasicMaterial color={CITY_POP_PALETTE.inkBlack} />
              </mesh>
              <mesh position={[0, 0, 0.23]}>
                <planeGeometry args={[signW - 0.3, signH - 0.25]} />
                <meshBasicMaterial map={signTex} />
              </mesh>
            </group>
          </group>
        );
      })}

      {/* 8b. 海边郊区：偶发独栋白墙 Motel 路边店（参考图 3）或双柱高耸 AMERICAN 公路招牌塔（参考图 2） */}
      {isSuburban &&
        chunkProps.suburbanFeature === "motel" &&
        chunkProps.suburbanFeaturePos && (
          <SuburbanRoadsideMotel
            position={chunkProps.suburbanFeaturePos}
            yaw={chunkProps.suburbanYaw}
          />
        )}
      {isSuburban &&
        chunkProps.suburbanFeature === "pylon" &&
        chunkProps.suburbanFeaturePos && (
          <RoadsidePylonSign
            position={chunkProps.suburbanFeaturePos}
            yaw={chunkProps.suburbanYaw - Math.PI / 2 + 0.3}
            style="american"
          />
        )}

      {/* 9. 城市街景小零件（公交站台 / ATM / 邮筒 / 消防栓 / 街边长椅） */}
      {!isSuburban && (
        <CityPopGlbInstance
          assetKey={chunkProps.streetPropKey}
          position={chunkProps.streetPropPos}
          rotation={[0, chunkProps.streetPropYaw, 0]}
          scale={1.0}
        />
      )}

      {/* 10. TF2 大型钢结构户外广告牌 */}
      {chunkProps.hasLargeBillboard && (
        <CityPopGlbInstance
          assetKey={chunkProps.billboardKey}
          position={chunkProps.billboardPos}
          rotation={[0, chunkProps.billboardYaw, 0]}
          scale={1.0}
        />
      )}

      {/* 11. 基于用户路牌模型延展的 3 种结构公路路牌（右侧堤顶压石单柱悬臂 / 双翼分流 / 跨路双向龙门架） */}
      {chunkProps.hasRoadSign && chunkProps.roadSignSample && (() => {
        const isGantry = chunkProps.roadSignKey === "userRoadSignGantry";
        const lateralOffset = isGantry ? 0 : -(ROAD_CONFIG.roadWidth * 0.5 + 0.58);
        const yOffset = isGantry ? 0 : 0.18;
        const posX =
          chunkProps.roadSignSample.position.x +
          chunkProps.roadSignSample.leftNormal.x * lateralOffset;
        const posZ =
          chunkProps.roadSignSample.position.z +
          chunkProps.roadSignSample.leftNormal.z * lateralOffset;
        return (
          <group
            position={[posX, chunkProps.roadSignSample.position.y + yOffset, posZ]}
            rotation={[0, chunkProps.roadSignSample.yaw, 0]}
          >
            <CityPopGlbInstance
              assetKey={chunkProps.roadSignKey}
              scale={1.0}
            />
          </group>
        );
      })()}

      {/* 10. 跨海薄荷绿系杆拱桥 */}
      {chunkProps.hasArchBridge && (
        <CoastalTiedArchBridge
          zCenter={zStart + ROAD_CONFIG.chunkLength * 0.5}
          seedOffset={seedOffset}
        />
      )}
    </group>
  );
}

export interface ProceduralCoastlineProps {
  /** 当前车辆所在区块索引 */
  currentChunk: number;
  /** 场景随机种子 */
  seed: number;
  /** 共享海面材质 */
  oceanMaterial: THREE.ShaderMaterial;
  /** 昼夜主题 */
  timeOfDay?: "noon" | "sunset";
}

/**
 * 无限流式海岸公路管理器
 */
export function ProceduralCoastline({
  currentChunk,
  seed,
  oceanMaterial,
  timeOfDay = "noon",
}: ProceduralCoastlineProps) {
  const activeChunkIndices = useMemo(() => {
    const list: number[] = [];
    // 前后双向对称加载 13 个区块（前向 624m + 后向 624m），让前方公路与街景延伸得更远，同时保证回看与 360° 环视时后方同样延伸至远方地平线
    for (let offset = -13; offset <= 13; offset++) {
      list.push(currentChunk + offset);
    }
    return list;
  }, [currentChunk]);

  return (
    <group>
      {activeChunkIndices.map((idx) => (
        <CoastlineChunk
          key={`${seed}_${idx}`}
          chunkIndex={idx}
          seed={seed}
          oceanMaterial={oceanMaterial}
          timeOfDay={timeOfDay}
        />
      ))}
    </group>
  );
}
