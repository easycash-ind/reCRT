import { createElement, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  CITYPOP_FADE_FRAG_SNIPPET,
  CITYPOP_FADE_UNIFORMS,
  CITYPOP_THEME_UNIFORMS,
  applyCityPopDistanceFade,
  getCityPopCelLitMaterial,
  getCityPopGradientMap,
  getCityPopIslandMaterial,
  getCityPopSignTexture,
  getUniformInkOutlineMaterial,
  getYacht3DSplashMaterial,
} from "./cityPopShaders";
import { CITY_POP_PALETTE } from "./highwayCurve";

const reflectiveGlassMatCache = new Map<"emerald" | "sapphire", THREE.ShaderMaterial>();

/**
 * 基于摄像机真实视角反射向量 (R = reflect(viewRay, flatWallNormal)) 的大厦深色镀膜玻璃材质
 * - 支持「墨绿色镀膜玻璃 (emerald)」与「深蓝色镀膜玻璃 (sapphire)」两套写实色调
 * - 采用屏幕空间几何平面法线 dFdx/dFdy 彻底消除三角面插值导致的「歪歪扭扭」畸变
 * - 整栋大楼共享连续的世界空间天空渐变与积雨云/层云反射场（随摄像机视角与行车位置产生真实光学视差，杜绝单窗重复条纹）
 */
function getFullReflectiveGlassMaterial(
  style: "emerald" | "sapphire" = "emerald"
): THREE.ShaderMaterial {
  const existing = reflectiveGlassMatCache.get(style);
  if (existing) return existing;

  const isEmerald = style === "emerald";
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    uniforms: {
      uIsEmerald: { value: isEmerald ? 1.0 : 0.0 },
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uFadeCarZ: CITYPOP_FADE_UNIFORMS.uCarZ,
      uFadeStart: CITYPOP_FADE_UNIFORMS.uFadeStart,
      uFadeEnd: CITYPOP_FADE_UNIFORMS.uFadeEnd,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vWorldNormal;
      varying float vFadeWorldZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 vp = viewMatrix * wp;
        vWorldPos = wp.xyz;
        vViewPos = vp.xyz;
        vFadeWorldZ = wp.z;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIsEmerald;
      uniform float uSunset;
      uniform float uFadeCarZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vWorldNormal;
      varying float vFadeWorldZ;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float puffNoise(vec2 p) {
        float n = noise2D(p);
        float c = abs(n * 2.0 - 1.0);
        return 1.0 - pow(c, 1.6);
      }

      float fbmCloud(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * puffNoise(p);
          p = rot * p * 2.03 + vec2(4.1, 2.3);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        ${CITYPOP_FADE_FRAG_SNIPPET}
        // 1. 使用视图空间偏导数计算玻璃几何平面法线（消除窗框平滑法线插值导致的每扇窗扭曲条纹），并转回世界空间
        vec3 viewRay = normalize(vWorldPos - cameraPosition);
        vec3 faceViewN = cross(dFdx(vViewPos), dFdy(vViewPos));
        float faceLen = length(faceViewN);
        vec3 nRaw = faceLen > 1e-6
          ? normalize((vec4(faceViewN / faceLen, 0.0) * viewMatrix).xyz)
          : normalize(vWorldNormal);
        if (dot(nRaw, -viewRay) < 0.0) {
          nRaw = -nRaw;
        }
        vec3 wallN = normalize(vec3(nRaw.x, nRaw.y * 0.15 + 0.06, nRaw.z));

        // 2. 从当前摄像机位置 (cameraPosition) 出发计算真实镜面反射射线 reflDir
        vec3 reflDir = reflect(viewRay, wallN);

        // 3. 采用无 ±PI 接缝的连续反射方向投影至天空与积雨云反射场（行驶过程中完全平滑连续，无闪烁撕裂）
        float reflElev = clamp(reflDir.y * 0.55 + 0.36 + (vWorldPos.y - 6.0) * 0.012, 0.0, 1.0);
        vec2 skyUv = vec2(
          (reflDir.x * 1.45 - reflDir.z * 0.85) + vWorldPos.z * 0.008 - vWorldPos.x * 0.006,
          reflElev * 2.6 + vWorldPos.y * 0.018
        );

        // 4. 采样映入玻璃中的远方柔和积雨云团与地平线水平层云
        vec2 warp = vec2(
          fbmCloud(skyUv * 1.15 + vec2(1.7, 3.2)),
          fbmCloud(skyUv * 1.15 + vec2(6.4, 2.1))
        );
        float cloudFbm = fbmCloud(skyUv * 1.85 + (warp - 0.5) * 0.42);
        float towerPeak = sin(skyUv.x * 1.45 + 0.8) * 0.20 + cos(skyUv.x * 0.85 - 0.5) * 0.14;
        float cloudDensity = (cloudFbm - 0.54) * 0.82 + towerPeak - abs(reflElev - 0.44) * 0.90;

        float stratusN = fbmCloud(vec2(skyUv.x * 2.4, reflElev * 12.0));
        float stratusDensity = (stratusN - 0.65) * 0.40 - abs(reflElev - 0.22) * 1.75;
        float finalCloud = max(cloudDensity, stratusDensity);

        // 5. 墨绿色镀膜玻璃 (Emerald) 与 深蓝色镀膜玻璃 (Sapphire) 的深邃天空底色 + 积雨云色阶配色（sunset 映射暮紫/玫瑰粉/橙金晚霞）
        vec3 skyBot = mix(uIsEmerald > 0.5 ? vec3(0.016, 0.086, 0.102) : vec3(0.020, 0.059, 0.137), vec3(0.110, 0.055, 0.220), uSunset);
        vec3 skyMid = mix(uIsEmerald > 0.5 ? vec3(0.035, 0.165, 0.188) : vec3(0.043, 0.133, 0.282), vec3(0.290, 0.110, 0.340), uSunset);
        vec3 skyTop = mix(uIsEmerald > 0.5 ? vec3(0.063, 0.247, 0.275) : vec3(0.075, 0.216, 0.424), vec3(0.580, 0.210, 0.360), uSunset);

        vec3 cldShadow = mix(uIsEmerald > 0.5 ? vec3(0.055, 0.220, 0.243) : vec3(0.067, 0.192, 0.376), vec3(0.240, 0.110, 0.330), uSunset);
        vec3 cldMid    = mix(uIsEmerald > 0.5 ? vec3(0.110, 0.365, 0.388) : vec3(0.129, 0.325, 0.569), vec3(0.580, 0.230, 0.420), uSunset);
        vec3 cldBright = mix(uIsEmerald > 0.5 ? vec3(0.212, 0.545, 0.537) : vec3(0.247, 0.506, 0.769), vec3(0.880, 0.450, 0.360), uSunset);
        vec3 cldCrest  = mix(uIsEmerald > 0.5 ? vec3(0.420, 0.765, 0.718) : vec3(0.467, 0.722, 0.933), vec3(1.000, 0.760, 0.520), uSunset);

        // 平滑抗锯齿天幕渐变，消除远景像素移动时的闪烁跳变
        vec3 col = mix(skyBot, skyMid, smoothstep(0.24, 0.32, reflElev));
        col = mix(col, skyTop, smoothstep(0.60, 0.68, reflElev));

        // 平滑抗锯齿云朵倒影分层（无硬阈值走样黑线闪烁）
        if (finalCloud > 0.0) {
          float sunVal = finalCloud * 1.80 + (cloudFbm - 0.5) * 0.45 + reflElev * 0.26;
          vec3 cCol = cldShadow;
          cCol = mix(cCol, cldMid,    smoothstep(0.09, 0.15, sunVal));
          cCol = mix(cCol, cldBright, smoothstep(0.25, 0.31, sunVal));
          cCol = mix(cCol, cldCrest,  smoothstep(0.43, 0.49, sunVal));
          col = mix(col, cCol, smoothstep(0.0, 0.035, finalCloud));
        }

        // 菲涅尔掠射角微弱清透增亮
        float fresnel = pow(1.0 - clamp(abs(dot(-viewRay, wallN)), 0.0, 1.0), 3.0);
        vec3 fresnelNoon = uIsEmerald > 0.5 ? vec3(0.04, 0.14, 0.15) : vec3(0.04, 0.11, 0.22);
        col += mix(fresnelNoon, vec3(0.26, 0.11, 0.14), uSunset) * fresnel;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  reflectiveGlassMatCache.set(style, mat);
  return mat;
}

let sharedPalmTrunkMat: THREE.ShaderMaterial | null = null;
/**
 * 铃木英人式光滑流线型棕榈树干三阶色层着色器
 * 消除原先 0.36m 周期性的竹节锯齿，采用平滑圆柱法线受光 + 非周期随机树皮纹理与顶部菠萝冠鳞片
 */
function getPalmTrunkMaterial(): THREE.ShaderMaterial {
  if (sharedPalmTrunkMat) return sharedPalmTrunkMat;

  sharedPalmTrunkMat = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    fog: false,
    uniforms: {
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uFadeCarZ: CITYPOP_FADE_UNIFORMS.uCarZ,
      uFadeStart: CITYPOP_FADE_UNIFORMS.uFadeStart,
      uFadeEnd: CITYPOP_FADE_UNIFORMS.uFadeEnd,
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying float vFadeWorldZ;
      void main() {
        vLocalPos = position;
        vFadeWorldZ = (modelMatrix * vec4(position, 1.0)).z;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSunset;
      uniform float uFadeCarZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying float vFadeWorldZ;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        ${CITYPOP_FADE_FRAG_SNIPPET}
        vec3 n = normalize(vWorldNormal);
        float sunDot = dot(n, normalize(vec3(0.78, 0.25, 0.56)));

        // 非周期性自然树皮纵向纤维纹理（绝不产生有规律的一节一节环纹）
        float ang = atan(n.x, n.z);
        float barkGrain = (noise2D(vec2(ang * 3.8, vLocalPos.y * 0.55)) - 0.5) * 0.22
                        + (noise2D(vec2(ang * 9.5, vLocalPos.y * 1.35 + 7.1)) - 0.5) * 0.12;
        float lightVal = sunDot + barkGrain;
        float fw = clamp(fwidth(lightVal), 0.008, 0.045);

        vec3 colInkShadow = mix(vec3(0.094, 0.075, 0.098), vec3(0.110, 0.063, 0.149), uSunset); // #181319 / #1C1026
        vec3 colMidAmber  = mix(vec3(0.647, 0.365, 0.184), vec3(0.490, 0.188, 0.227), uSunset); // #A55D2F / #7D303A
        vec3 colSunOchre  = mix(vec3(0.878, 0.596, 0.306), vec3(0.831, 0.384, 0.267), uSunset); // #E0984E / #D46244
        vec3 colHighlight = mix(vec3(0.957, 0.745, 0.455), vec3(1.000, 0.678, 0.400), uSunset); // #F4BE74 / #FFAD66

        vec3 col = colInkShadow;
        if (lightVal > 0.48) {
          col = colHighlight;
        } else if (lightVal > 0.14) {
          col = colSunOchre;
        } else if (lightVal > -0.12) {
          col = colMidAmber;
        }

        // 色阶分界处的钢笔细勾线
        float bandDist = min(abs(lightVal - (-0.12)), min(abs(lightVal - 0.14), abs(lightVal - 0.48)));
        if (bandDist < fw * 0.75) {
          col = mix(col, colInkShadow, 0.78);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return sharedPalmTrunkMat;
}

export const CITYPOP_GLB_PATHS = {
  // 用户提供的 3 款经典跑车/老爷车模型 (已减面、剔除战损层与校准车头朝向)
  userCarMorgan: "/citypop-glb/user_car_morgan.glb?v=5",
  userCarZis101: "/citypop-glb/user_car_zis101.glb?v=11",
  userCarRetroA: "/citypop-glb/user_car_retro_a.glb?v=12",
  carSedanSports: "/citypop-glb/car_sedan_sports.glb",
  carHatchbackSports: "/citypop-glb/car_hatchback_sports.glb",
  carRace: "/citypop-glb/car_race.glb",

  // 用户提供的路牌模型及其延展出的 3 种结构路牌 + 鹅颈路灯
  lightCurved: "/citypop-glb/highway_cobra_light_single.glb",
  lightCurvedDouble: "/citypop-glb/highway_cobra_light_double.glb",
  userRoadSignSingle: "/citypop-glb/user_road_sign_single.glb?v=8",
  userRoadSignTwinWing: "/citypop-glb/user_road_sign_twin_wing.glb?v=8",
  userRoadSignGantry: "/citypop-glb/user_road_sign_gantry.glb?v=8",

  // 用户提供的 TF2 大型户外广告牌 (3 款)
  userBillboardTrussLarge: "/citypop-glb/user_billboard_truss_large.glb",
  userBillboardFrameMed: "/citypop-glb/user_billboard_frame_med.glb",
  userBillboardLitMarquee: "/citypop-glb/user_billboard_lit_marquee.glb",

  // 用户提供的城市小零件 (公交候车亭、ATM/邮筒/消防栓/停车表簇、长椅/垃圾桶/配电箱簇)
  userPropBusStop: "/citypop-glb/user_prop_bus_stop.glb?v=2",
  userPropSidewalkCluster: "/citypop-glb/user_prop_sidewalk_cluster.glb?v=2",
  userPropBenchUtility: "/citypop-glb/user_prop_bench_utility.glb?v=2",

  // 用户提供的 Realistic City & San Francisco City 建筑 + 现代主义海景酒店 (已清除单窗重复条纹并平整建筑法线)
  userCityBldg1: "/citypop-glb/user_city_bldg_1.glb?v=7",
  userCityBldg2: "/citypop-glb/user_city_bldg_2.glb?v=7",
  userCityBldg3: "/citypop-glb/user_city_bldg_3.glb?v=7",
  userSfBldg1: "/citypop-glb/user_sf_bldg_1.glb?v=7",
  userSfBldg2: "/citypop-glb/user_sf_bldg_2.glb?v=7",
  skyscraperA: "/citypop-glb/citypop_hotel_tower_a.glb?v=7",
  skyscraperB: "/citypop-glb/citypop_hotel_tower_b.glb?v=7",
  skyscraperC: "/citypop-glb/citypop_commercial_corner_c.glb?v=7",
  parasolA: "/citypop-glb/detail_parasol_a.glb",

  // 用户提供的 3 款豪华游艇模型 + Blender 3D 翻卷浪冠
  userYachtNeoland: "/citypop-glb/user_yacht_neoland.glb",
  userYachtClassic: "/citypop-glb/user_yacht_classic.glb",
  userYachtMotor: "/citypop-glb/user_yacht_motor.glb",
  yachtSplash: "/citypop-glb/citypop_yacht_splash.glb?v=4",

  // 永井博风格修长棕榈树、郊区 Motel、远景海岛与海鸥
  palmBend: "/citypop-glb/nagai_palm_curved.glb?v=7",
  palmStraight: "/citypop-glb/nagai_palm_tall.glb?v=7",
  palmTall: "/citypop-glb/nagai_palm_tall.glb?v=7",
  bushDetailed: "/citypop-glb/bush_detailed.glb",
  suburbanMotel: "/citypop-glb/citypop_suburban_motel.glb",
  distantIsland: "/citypop-glb/citypop_distant_island.glb?v=7",
  storkBird: "/citypop-glb/stork_bird.glb",
} as const;

export type CityPopAssetKey = keyof typeof CITYPOP_GLB_PATHS;

interface NormalizeSpec {
  targetHeight?: number;
  targetLength?: number;
  rotY?: number;
  ySinkRatio?: number;
}

/**
 * 针对外部导入模型的自动包围盒居中、接地与真实米制尺寸归一化配置表
 */
const ASSET_NORMALIZE_SPECS: Partial<Record<CityPopAssetKey, NormalizeSpec>> = {
  userCarMorgan: { targetLength: 4.45 },
  userCarZis101: { targetLength: 4.85, rotY: Math.PI },
  userCarRetroA: { targetLength: 4.4 },
  userYachtNeoland: { targetLength: 12.2, rotY: Math.PI / 2, ySinkRatio: 0.14 },
  userYachtClassic: { targetLength: 11.2, ySinkRatio: 0.16 },
  userYachtMotor: { targetLength: 12.8, ySinkRatio: 0.14 },
  userCityBldg1: { targetHeight: 26.0 },
  userCityBldg2: { targetHeight: 34.0 },
  userCityBldg3: { targetHeight: 30.0 },
  userSfBldg1: { targetHeight: 28.0 },
  userSfBldg2: { targetHeight: 25.0 },
  userBillboardTrussLarge: {
    targetHeight: 10.2,
    rotY: Math.PI / 4,
    ySinkRatio: 0.14,
  },
  userBillboardFrameMed: {
    targetHeight: 9.2,
    rotY: -Math.PI / 4,
    ySinkRatio: 0.14,
  },
  userBillboardLitMarquee: { targetHeight: 6.8, ySinkRatio: 0.14 },
  userPropBusStop: { targetHeight: 3.0, rotY: -Math.PI / 2 },
  userPropSidewalkCluster: { targetHeight: 1.95 },
  userPropBenchUtility: { targetHeight: 1.55 },
  userRoadSignSingle: { targetHeight: 7.8 },
  userRoadSignTwinWing: { targetHeight: 8.2 },
  userRoadSignGantry: { targetHeight: 9.2 },
};

const processedPrototypeCache = new Map<string, THREE.Group>();
const sharedEdgeLineMat = applyCityPopDistanceFade(
  new THREE.LineBasicMaterial({
    color: CITY_POP_PALETTE.inkBlack,
  })
);

/**
 * 将加载的 GLTF Scene 转换为带 City Pop 赛璐璐色阶 + 结构墨线 + 自动原点接地归一化的轻量级原型
 */
function getOrCreateToonPrototype(
  assetKey: CityPopAssetKey,
  cacheKey: string,
  sourceScene: THREE.Group,
  tintHex?: string,
  withEdges = true,
  frondVariant?: number
): THREE.Group {
  const existing = processedPrototypeCache.get(cacheKey);
  if (existing) return existing;

  const root = sourceScene.clone(true);
  const gradientMap = getCityPopGradientMap();
  const matMap = new Map<THREE.Material, THREE.Material>();

  const sourceMeshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      sourceMeshes.push(obj);
    }
  });

  // 全部 GLB 资产已完成减面优化（均 < 35000 顶点），全量开启外轮廓描边与结构折痕墨线
  const totalVerts = sourceMeshes.reduce(
    (acc, m) => acc + (m.geometry?.attributes?.position?.count ?? 0),
    0
  );

  const isUserYacht = assetKey.startsWith("userYacht");
  const isUserCar = assetKey.startsWith("userCar") || assetKey.startsWith("car");
  const isUserProp = assetKey.startsWith("userProp");
  const isBillboard = assetKey.startsWith("userBillboard");
  const isRoadSign = assetKey.startsWith("userRoadSign");
  const isBuilding =
    assetKey.startsWith("userCityBldg") ||
    assetKey.startsWith("userSfBldg") ||
    assetKey.startsWith("skyscraper") ||
    assetKey === "suburbanMotel";

  const glassStyle: "emerald" | "sapphire" =
    assetKey === "userCityBldg1" ||
    assetKey === "userCityBldg3" ||
    assetKey === "userSfBldg1" ||
    assetKey === "skyscraperB"
      ? "emerald"
      : "sapphire";

  for (const mesh of sourceMeshes) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const isFrond =
      mesh.name.includes("Frond") ||
      Boolean(mesh.parent?.name.includes("Frond"));
    const isPalmTrunk =
      mesh.name.includes("Trunk") ||
      Boolean(mesh.parent?.name.includes("Trunk"));
    const isSplash =
      mesh.name.includes("YachtSplash") ||
      Boolean(mesh.parent?.name.includes("YachtSplash"));
    const isIsland =
      assetKey === "distantIsland" ||
      mesh.name.includes("DistantIsland") ||
      Boolean(mesh.parent?.name.includes("DistantIsland"));

    const mapOneMaterial = (srcMat: THREE.Material) => {
      let toonMat = matMap.get(srcMat);
      if (!toonMat) {
        const stdMat = srcMat as THREE.MeshStandardMaterial;
        const matLower = (stdMat.name ?? "").toLowerCase();
        const isFrondMat = isFrond || matLower.includes("frond");
        const isRoadSignFace = isRoadSign && matLower.includes("roadsignface");
        const isTireMat =
          matLower.includes("tyre") ||
          matLower.includes("tire") ||
          matLower.includes("rubber") ||
          matLower.includes("wheel") ||
          matLower.includes("rwheel") ||
          matLower.includes("frwheel");
        const baseColor = stdMat.color
          ? stdMat.color.clone()
          : new THREE.Color("#FFFFFF");
        const isDarkBldgGlassOrSpandrel =
          isBuilding &&
          !stdMat.map &&
          (matLower.includes("light") ||
            matLower.includes("material.") ||
            (baseColor.r < 0.08 && baseColor.g < 0.08 && baseColor.b < 0.08));
        const isGlassMat = Boolean(
          !isTireMat &&
            !isRoadSign &&
            !isUserProp &&
            (matLower.includes("glass") ||
              matLower.includes("window") ||
              matLower.includes("vetro") ||
              matLower.includes("glaze") ||
              isDarkBldgGlassOrSpandrel)
        );

        if (stdMat.map) {
          stdMat.map.colorSpace = THREE.SRGBColorSpace;
          stdMat.map.anisotropy = 4;
        }
        if (isUserCar && !isTireMat && tintHex) {
          // 对向与停靠车辆外壳：使用鲜明的 City Pop 车漆色覆盖原始暗黑材质
          baseColor.set(tintHex);
        } else if (tintHex && !stdMat.map && !isBuilding && !isRoadSign) {
          baseColor.lerp(new THREE.Color(tintHex), 0.32);
        }
        if (isBillboard) {
          baseColor.set("#4A668C");
        } else if (isRoadSignFace) {
          baseColor.set("#FFFFFF");
        } else if (isRoadSign) {
          // 公路路牌钢结构立柱、横梁与背板：清透天青银白钢材色，配合四阶色温光影分层
          baseColor.set("#B8D4F2");
        } else if (isUserProp) {
          // 街头城市小零件（候车亭、ATM、邮筒、消防栓、长椅、垃圾桶）：替换为鲜明的 City Pop 粉彩配色以突显四阶光影分层
          if (matLower.includes("hydrant") || matLower.includes("postbox")) {
            baseColor.set("#FF5268");
          } else if (matLower.includes("atm") || matLower.includes("sign")) {
            baseColor.set("#38B6FF");
          } else if (matLower.includes("bench") || matLower.includes("trash")) {
            baseColor.set("#FFCC29");
          } else {
            baseColor.set("#DDF0FF");
          }
        } else if (isBuilding && !isGlassMat) {
          // 提亮外部建筑过暗的原始墙面色，使群青/天青/暖白四阶光影分层清晰可见
          if (baseColor.r + baseColor.g + baseColor.b < 1.35) {
            baseColor.lerp(new THREE.Color("#E8F2FC"), 0.65);
          }
        } else if (isUserYacht && !isGlassMat) {
          baseColor.lerp(new THREE.Color("#FFFDF8"), 0.58);
        }

        if (isIsland) {
          toonMat = getCityPopIslandMaterial();
        } else if (isPalmTrunk || matLower.includes("palmtrunk")) {
          toonMat = getPalmTrunkMaterial();
        } else if (isSplash) {
          toonMat = getYacht3DSplashMaterial();
        } else if (isFrondMat) {
          const frondMat = new THREE.MeshBasicMaterial({
            color: baseColor,
            side: THREE.DoubleSide,
            fog: false,
          });
          frondMat.onBeforeCompile = (shader) => {
            shader.uniforms.uSunset = CITYPOP_THEME_UNIFORMS.uSunset;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <common>",
              `#include <common>\nuniform float uSunset;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <opaque_fragment>",
              `outgoingLight = mix(outgoingLight, outgoingLight * vec3(1.12, 0.68, 0.52), uSunset);\n#include <opaque_fragment>`
            );
          };
          toonMat = applyCityPopDistanceFade(frondMat);
        } else if (isGlassMat) {
          // 100% 不透明墨绿/深蓝镀膜大厦玻璃（映射当前摄像机视角下的天空与积雨云倒影）
          toonMat = getFullReflectiveGlassMaterial(glassStyle);
        } else {
          const customMap = isRoadSignFace
            ? getCityPopSignTexture("highway_guide")
            : isBillboard ||
              isRoadSign ||
              isUserProp ||
              isSplash ||
              (isBuilding && assetKey.startsWith("userCityBldg")) ||
              (isUserCar && !isTireMat)
            ? null
            : (stdMat.map ?? null);
          const toon = new THREE.MeshToonMaterial({
            color: baseColor,
            map: customMap,
            normalMap:
              isBillboard || isRoadSign || isUserProp
                ? null
                : (stdMat.normalMap ?? null),
            gradientMap,
            transparent: false,
            opacity: 1.0,
            side: isRoadSignFace ? THREE.FrontSide : THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          });
          toon.onBeforeCompile = (shader) => {
            shader.uniforms.uSunset = CITYPOP_THEME_UNIFORMS.uSunset;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <common>",
              `#include <common>\nuniform float uSunset;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <opaque_fragment>",
              /* glsl */ `
                // 铃木英人式全场景模型统一 4 阶硬边色温分层着色 + 色层分界细墨线
                // 建筑墙面采用屏幕空间平整几何法线 cross(dFdx, dFdy)，彻底消除减面顶点法线插值导致的歪扭波纹
                vec3 nV = ${
                  isBuilding
                    ? "normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)))"
                    : "normalize(vNormal)"
                };
                float rawSun = dot(nV, normalize(vec3(-0.55, 0.68, 0.48))) * 0.5 + 0.5;
                float spatialContour = ${
                  isBuilding
                    ? "0.0"
                    : "sin(vViewPosition.x * 0.52 - vViewPosition.y * 0.68) * 0.16"
                };
                float sunBand = clamp(rawSun * 0.84 + spatialContour + 0.08, 0.0, 1.0);
                float fwB = clamp(fwidth(sunBand), 0.004, 0.045);

                vec3 tintBand = vec3(1.0);
                if (sunBand < 0.28) {
                  tintBand = mix(vec3(0.32, 0.48, 0.82), vec3(0.34, 0.22, 0.54), uSunset); // 群青冷调 / 日落暮紫暗部
                } else if (sunBand < 0.54) {
                  tintBand = mix(vec3(0.62, 0.84, 0.98), vec3(0.76, 0.44, 0.62), uSunset); // 天青冷调 / 日落玫瑰灰过渡面
                } else if (sunBand < 0.78) {
                  tintBand = mix(vec3(0.98, 0.96, 0.93), vec3(1.12, 0.76, 0.56), uSunset); // 暖阳主受光面 / 日落琥珀珊瑚光
                } else {
                  tintBand = mix(vec3(1.08, 1.06, 1.02), vec3(1.24, 0.92, 0.68), uSunset); // 明快高光面 / 蜜桃金高光
                }

                // 在每一阶色层分界处绘制细腻的版画分界墨线
                float distEdge = min(
                  min(abs(sunBand - 0.28), abs(sunBand - 0.54)),
                  abs(sunBand - 0.78)
                );
                if (!${isBuilding ? "true" : "false"} && distEdge < fwB * 0.72) {
                  tintBand *= 0.32;
                }

                outgoingLight = diffuseColor.rgb * tintBand;
                #include <opaque_fragment>
              `
            );
          };
          toonMat = applyCityPopDistanceFade(toon);
        }
        matMap.set(srcMat, toonMat);
      }
      return toonMat;
    };

    if (isFrond && frondVariant !== undefined && mesh.geometry) {
      const geo = mesh.geometry.clone();
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      const posAttr = geo.attributes.position;
      if (box && posAttr) {
        const cx = (box.min.x + box.max.x) * 0.5;
        const cz = (box.min.z + box.max.z) * 0.5;
        const cy = box.min.y + (box.max.y - box.min.y) * 0.24;
        const seed = frondVariant * 1.73 + 0.5;

        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const vz = posAttr.getZ(i);
          const dx = vx - cx;
          const dy = vy - cy;
          const dz = vz - cz;
          const rad = Math.hypot(dx, dz);
          if (rad < 0.26) continue;

          const ang = Math.atan2(dz, dx);
          // 1. 长度随机性（沿叶轴方向伸缩，保留中心菠萝头根部衔接）
          const lenFactor =
            1.0 +
            0.2 * Math.sin(ang * 5.0 + seed * 1.7) +
            0.14 * Math.cos(ang * 11.0 - seed * 2.3);
          // 2. 俯仰角随机性（部分羽叶上扬挺拔、部分外展下垂）
          const pitchAngle =
            0.22 * Math.sin(ang * 7.0 + seed * 2.9) +
            0.13 * Math.cos(ang * 13.0 + seed * 0.8);
          // 3. 水平歪斜/偏航随机性（打破等角放射状排列）
          const yawSkew =
            0.16 * Math.sin(ang * 6.0 - seed * 1.3) +
            0.1 * Math.cos(ang * 9.0 + seed * 3.1);
          // 4. 叶梢额外自然垂坠弧度
          const tipT = Math.min(1.4, rad / 3.2);
          const droopExtra =
            0.34 * Math.sin(ang * 4.0 + seed * 4.1) * tipT * tipT;

          // 先做长度缩放
          const sx = dx * lenFactor;
          const sy = dy * lenFactor;
          const sz = dz * lenFactor;

          // 绕切向轴做俯仰旋转
          const sRad = Math.hypot(sx, sz);
          const ux = sx / Math.max(sRad, 1e-5);
          const uz = sz / Math.max(sRad, 1e-5);
          const cosP = Math.cos(pitchAngle);
          const sinP = Math.sin(pitchAngle);
          const pRad = sRad * cosP - sy * sinP;
          const py = sRad * sinP + sy * cosP - droopExtra;
          const px = ux * pRad;
          const pz = uz * pRad;

          // 绕垂直轴做水平歪斜旋转
          const cosY = Math.cos(yawSkew);
          const sinY = Math.sin(yawSkew);
          const fx = px * cosY - pz * sinY;
          const fz = px * sinY + pz * cosY;

          posAttr.setXYZ(i, cx + fx, cy + py, cz + fz);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
      }
      mesh.geometry = geo;
    }

    // 棕榈树干沿水平法线向内微缩，使树茎更修长纤细（同时保持弯曲中心线与顶部树冠严丝合缝）
    if (isPalmTrunk && mesh.geometry) {
      const geo = mesh.geometry.clone();
      geo.computeBoundingBox();
      const bbox = geo.boundingBox;
      const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
      const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
      if (bbox && posAttr && normAttr) {
        const minY = bbox.min.y;
        const trunkH = Math.max(0.01, bbox.max.y - minY);
        for (let i = 0; i < posAttr.count; i++) {
          const px = posAttr.getX(i);
          const py = posAttr.getY(i);
          const pz = posAttr.getZ(i);
          const nx = normAttr.getX(i);
          const nz = normAttr.getZ(i);
          const hLen = Math.hypot(nx, nz);
          if (hLen > 0.05) {
            const yNorm = THREE.MathUtils.clamp((py - minY) / trunkH, 0, 1);
            const crownFade = yNorm > 0.92 ? 1.0 - (yNorm - 0.92) / 0.08 : 1.0;
            const shrink = (1.0 - 0.45 * yNorm) * 0.065 * crownFade;
            posAttr.setXYZ(
              i,
              px - (nx / hLen) * shrink,
              py,
              pz - (nz / hLen) * shrink
            );
          }
        }
        posAttr.needsUpdate = true;
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
      }
      mesh.geometry = geo;
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(mapOneMaterial);
    } else if (mesh.material) {
      mesh.material = mapOneMaterial(mesh.material);
    }

    if (withEdges && mesh.geometry && !isFrond) {
      // 结构折痕墨线 (EdgesGeometry) 用于建筑/路牌/路灯/街景道具（含高面数写实建筑），避免棕榈树干出现横节折痕或曲面车船发黑
      if (
        !isSplash &&
        !isIsland &&
        !isPalmTrunk &&
        !isUserYacht &&
        !isUserCar &&
        (totalVerts <= 8000 || isRoadSign || isBuilding)
      ) {
        const edgeThreshold = isBuilding ? 30 : isRoadSign ? 28 : 24;
        const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, edgeThreshold);
        const edgeLines = new THREE.LineSegments(edgesGeo, sharedEdgeLineMat);
        mesh.add(edgeLines);
      }

      // 全场景所有非海岛/非树叶/非动态浪花模型 100% 挂载恒定屏幕像素宽度法线外扩描边（海岛与 3D 浪花由各自 GLSL 片元着色器实时绘制等宽噪波墨线）
      if (!isIsland && !isSplash) {
        const hull = new THREE.Mesh(
          mesh.geometry,
          getUniformInkOutlineMaterial()
        );
        mesh.add(hull);
      }
    }
  }

  // 自动包围盒居中、底部贴地与真实米制尺寸校准
  const wrapper = new THREE.Group();
  wrapper.add(root);

  const normSpec = ASSET_NORMALIZE_SPECS[assetKey];
  if (normSpec) {
    if (normSpec.rotY) {
      root.rotation.y = normSpec.rotY;
    }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);

    let s = 1.0;
    if (normSpec.targetHeight && size.y > 0.001) {
      s = normSpec.targetHeight / size.y;
    } else if (normSpec.targetLength && Math.max(size.x, size.z) > 0.001) {
      s = normSpec.targetLength / Math.max(size.x, size.z);
    }
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);

    box.setFromObject(root);
    box.getCenter(center);
    box.getSize(size);

    const sinkY = (normSpec.ySinkRatio ?? 0) * size.y;
    root.position.set(
      root.position.x - (isRoadSign ? 0 : center.x),
      root.position.y - box.min.y - sinkY,
      root.position.z - center.z
    );

    // 针对外部城市建筑：在建筑内部嵌入实心墨绿/深蓝全反射玻璃幕墙内胆，彻底消除任何窗洞缺面并呈现完整连贯的天空云朵倒影
    if (assetKey.startsWith("userCityBldg")) {
      const coreMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 0.88, size.y * 0.94, size.z * 0.88),
        getFullReflectiveGlassMaterial(glassStyle)
      );
      coreMesh.position.set(0, size.y * 0.47, 0);
      wrapper.add(coreMesh);
    }

    // 针对大型户外广告牌：挂载双面定制 City Pop 巨幅海报贴图（严丝合缝贴合已对齐 X 轴的 GLB 钢架版面）+ 深入地下的双侧钢结构立柱
    if (isBillboard) {
      const adVariant =
        assetKey === "userBillboardTrussLarge"
          ? "pacific"
          : assetKey === "userBillboardFrameMed"
          ? "yacht"
          : "stereo";
      const adTex = getCityPopSignTexture(adVariant);
      const boardW = size.x * 0.96;
      const boardH =
        assetKey === "userBillboardTrussLarge"
          ? size.y * 0.34
          : assetKey === "userBillboardFrameMed"
          ? size.y * 0.52
          : size.y * 0.62;
      const boardY =
        assetKey === "userBillboardTrussLarge"
          ? size.y * 0.72 - sinkY
          : assetKey === "userBillboardFrameMed"
          ? size.y * 0.56 - sinkY
          : size.y * 0.66 - sinkY;
      const boardZ =
        assetKey === "userBillboardTrussLarge"
          ? -size.z * 0.11
          : assetKey === "userBillboardFrameMed"
          ? size.z * 0.12
          : size.z * 0.21;

      const boardGroup = new THREE.Group();
      boardGroup.position.set(0, boardY, boardZ);

      // 黑色钢笔描边外框箱体
      const frameBox = new THREE.Mesh(
        new THREE.BoxGeometry(boardW + 0.36, boardH + 0.36, 0.52),
        applyCityPopDistanceFade(
          new THREE.MeshBasicMaterial({ color: CITY_POP_PALETTE.inkBlack })
        )
      );
      boardGroup.add(frameBox);

      // 正反双面定制 City Pop 广告画面
      const planeGeo = new THREE.PlaneGeometry(boardW, boardH);
      const planeMat = applyCityPopDistanceFade(
        new THREE.MeshBasicMaterial({ map: adTex })
      );
      const frontFace = new THREE.Mesh(planeGeo, planeMat);
      frontFace.position.z = 0.28;
      const backFace = new THREE.Mesh(planeGeo, planeMat);
      backFace.position.z = -0.28;
      backFace.rotation.y = Math.PI;
      boardGroup.add(frontFace, backFace);

      // 左右两侧直插地下 (-3.5m) 的双 H 型钢立柱，带四阶色彩分层光影与恒定像素外轮廓描边
      const legSpanX = boardW * 0.38;
      const legH = boardY + 3.5;
      const legGeo = new THREE.BoxGeometry(0.32, legH, 0.32);
      const legMat = getCityPopCelLitMaterial("#82ACE0");
      for (const lx of [-legSpanX, legSpanX]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, -boardY * 0.5 - 1.5, -boardZ);
        leg.add(new THREE.Mesh(legGeo, getUniformInkOutlineMaterial()));
        boardGroup.add(leg);
      }

      wrapper.add(boardGroup);
    }
  }

  processedPrototypeCache.set(cacheKey, wrapper);
  return wrapper;
}

/**
 * 高性能可复用 GLB 资产实例组件（底层共享 Geometry、ToonMaterial 与 EdgesGeometry）
 */
export function CityPopGlbInstance({
  assetKey,
  position,
  rotation,
  scale = 1,
  tintHex,
  withEdges = true,
  frondVariant,
}: {
  assetKey: CityPopAssetKey;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  tintHex?: string;
  withEdges?: boolean;
  frondVariant?: number;
}) {
  const path = CITYPOP_GLB_PATHS[assetKey];
  const gltf = useGLTF(path);

  const instance = useMemo(() => {
    const cacheKey = `${assetKey}_${tintHex ?? "none"}_${withEdges ? "e1" : "e0"}_fv${frondVariant ?? "none"}`;
    const proto = getOrCreateToonPrototype(
      assetKey,
      cacheKey,
      gltf.scene,
      tintHex,
      withEdges,
      frondVariant
    );
    return proto.clone(true);
  }, [assetKey, gltf.scene, tintHex, withEdges, frondVariant]);

  return createElement("primitive", {
    object: instance,
    position,
    rotation,
    scale,
  });
}

Object.values(CITYPOP_GLB_PATHS).forEach((p) => {
  useGLTF.preload(p);
});
