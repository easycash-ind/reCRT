import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  CITY_POP_PALETTE,
  ROAD_CONFIG,
  sampleRoad,
} from "./highwayCurve";
import {
  createCityPopCloudMaterial,
  createYachtWakeMaterial,
  getUniformInkOutlineMaterial,
  getYacht3DSplashMaterial,
} from "./cityPopShaders";
import {
  CityPopGlbInstance,
  type CityPopAssetKey,
} from "./cityPopGlbAssets";

export interface CityPopSkyAndOceanProps {
  /** 车辆实时连续 Z 坐标引用（每帧平滑同步，彻底消除跳变卡顿） */
  carZRef: React.MutableRefObject<number>;
  /** 随机种子 */
  seed: number;
  /** 共享海面 ShaderMaterial */
  oceanMaterial: THREE.ShaderMaterial;
  /** 主题时段：正午钴蓝 (noon) 或 夏日夕阳 (sunset) */
  timeOfDay?: "noon" | "sunset";
}

/**
 * 基于真实 3D 船舶 GLB 资产与 Blender 5.1 雕刻级 3D 翻卷浪花 (citypop_yacht_splash.glb) 的游艇/帆船组件
 * 复刻《Yacht World》&《Tasty Jam》：船首两侧向外翻卷的花椰菜状雪白浪冠 + 亮天蓝内卷浪心 + 水面分水尾迹
 */
function GlbYacht({
  assetKey,
  scale = 2.8,
  wakeMaterial,
  phaseOffset = 0,
  isSunset = false,
}: {
  assetKey: CityPopAssetKey;
  scale?: number;
  wakeMaterial: THREE.ShaderMaterial;
  phaseOffset?: number;
  isSunset?: boolean;
}) {
  const hullGroupRef = useRef<THREE.Group>(null);
  const sprayDropsRef = useRef<THREE.Group>(null);
  const outlineMat = useMemo(() => getUniformInkOutlineMaterial(), []);

  // 游艇船体破浪俯仰律动 + 船首飞溅泡沫水珠抛物线轨迹（3D 浪花曲面本身由 getYacht3DSplashMaterial 的三维行进噪波场实时控制表面翻涌与边缘碎裂）
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 3.0 + phaseOffset;

    if (hullGroupRef.current) {
      hullGroupRef.current.rotation.x = Math.sin(t * 1.5) * 0.035 - 0.022;
      hullGroupRef.current.rotation.z = Math.cos(t * 1.1) * 0.025;
      hullGroupRef.current.position.y = Math.sin(t * 2.0) * 0.08;
    }

    if (sprayDropsRef.current) {
      sprayDropsRef.current.children.forEach((drop, i) => {
        const dp = (t * 0.95 + i * 0.13) % 1.0;
        const side = i % 2 === 0 ? 1 : -1;
        const spread = 0.72 + dp * 1.35 + Math.sin(t * 2.8 + i) * 0.16;
        drop.position.set(
          side * spread,
          0.14 + Math.sin(dp * Math.PI) * (0.68 + (i % 3) * 0.18),
          2.6 - dp * 6.8
        );
        const s = Math.sin(dp * Math.PI) * (0.14 + (i % 2) * 0.05);
        drop.scale.setScalar(Math.max(0.01, s));
      });
    }
  });

  return (
    <group>
      {/* 1. 水面平铺 GLSL 高速动态分水尾迹与飞溅水滴 */}
      <mesh
        position={[0, 0.22, -3.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={wakeMaterial}
      >
        <planeGeometry args={[12.0, 22.0]} />
      </mesh>

      {/* 2. 三维行进噪波场实时控制曲面起伏、浪冠翻卷与边缘碎裂的 3D 船首破浪浪冠（收窄翼展使其紧贴船体两侧高速劈波） */}
      <group position={[0, 0.14, 0.7]}>
        <CityPopGlbInstance
          assetKey="yachtSplash"
          rotation={[0, 0, 0]}
          scale={[0.95, 1.18, 1.05]}
          withEdges={false}
        />
      </group>

      {/* 3. 动态抛射的飞溅浪花白泡簇（带恒定像素钢笔墨线描边） */}
      <group ref={sprayDropsRef}>
        {Array.from({ length: 10 }).map((_, idx) => (
          <group key={idx}>
            <mesh>
              <dodecahedronGeometry args={[1, 1]} />
              <meshBasicMaterial
                color={
                  isSunset
                    ? idx % 3 === 0
                      ? "#D9687C"
                      : "#FFE2B8"
                    : idx % 3 === 0
                    ? "#38B6FF"
                    : "#FFFDF8"
                }
              />
            </mesh>
            <mesh material={outlineMat}>
              <dodecahedronGeometry args={[1, 1]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 4. 水面横向《Tasty Jam》式动态拉丝波纹倒影条带 */}
      {[-1.2, -1.9, -2.6].map((rx, idx) => (
        <mesh
          key={idx}
          position={[rx - 2.2, 0.16, 0.2 + (idx % 2) * 0.35]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.34, 7.2 - idx * 1.1]} />
          <meshBasicMaterial
            color={
              isSunset
                ? idx % 2 === 0
                  ? "#F2C49B"
                  : "#C95A78"
                : idx % 2 === 0
                ? "#EAE4D8"
                : "#68B9F8"
            }
          />
        </mesh>
      ))}

      <group ref={hullGroupRef}>
        <CityPopGlbInstance
          assetKey={assetKey}
          scale={scale}
          rotation={[0, 0, 0]}
        />
      </group>
    </group>
  );
}

/**
 * 基于真实 3D 飞鸟 GLB 模型 (stork_bird.glb) 的海鸥盘旋群
 * 支持「间歇性/偶发式振翅挥动动画」：大部分时间迎着海风舒展滑翔，每隔数秒偶发扇动 2~3 下双翼并伴随轻盈抬升
 */
function GlbSeagullFlock({
  carZRef,
}: {
  carZRef: React.MutableRefObject<number>;
}) {
  const flockRef = useRef<THREE.Group>(null);
  const storkGltf = useGLTF("/citypop-glb/stork_bird.glb");

  const { gulls, gullInstances } = useMemo(() => {
    const specs = [
      { x: -18, y: 23, zOffset: 62, speed: 1.2, phase: 0.2, scale: 0.015 },
      { x: -7, y: 27, zOffset: 78, speed: 1.4, phase: 1.7, scale: 0.016 },
      { x: 6, y: 30, zOffset: 94, speed: 1.1, phase: 3.1, scale: 0.015 },
      { x: -30, y: 21, zOffset: 56, speed: 1.5, phase: 4.6, scale: 0.014 },
      { x: -12, y: 32, zOffset: 106, speed: 1.25, phase: 6.0, scale: 0.016 },
    ];

    // 为每只海鸥构建带独立 uFlap 顶点弯翼 Uniform 与 MorphTarget 的克隆实例
    const instances = specs.map(() => {
      const cloned = storkGltf.scene.clone(true);
      const flapUniform = { value: 0.0 };

      const meshes: THREE.Mesh[] = [];
      cloned.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          meshes.push(obj);
        }
      });

      for (const obj of meshes) {
        const mat = new THREE.MeshBasicMaterial({
          color: "#FFFDF8",
          side: THREE.DoubleSide,
        });
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uFlap = flapUniform;
          shader.vertexShader =
            "uniform float uFlap;\n" +
            shader.vertexShader.replace(
              "#include <begin_vertex>",
              /* glsl */ `
                #include <begin_vertex>
                // 沿翼展 X 方向 (|position.x| > 10.0) 施加自然的上下挥翼弧度变形
                float wingDist = max(0.0, abs(position.x) - 10.0);
                transformed.z += wingDist * uFlap * 0.65;
                transformed.y += wingDist * uFlap * 0.28;
              `
            );
        };
        obj.material = mat;

        const outlineMat = new THREE.ShaderMaterial({
          side: THREE.BackSide,
          uniforms: {
            uFlap: flapUniform,
            uInkColor: { value: new THREE.Color(CITY_POP_PALETTE.inkBlack) },
            uPixelWidth: { value: 1.65 },
          },
          vertexShader: /* glsl */ `
            uniform float uFlap;
            uniform float uPixelWidth;
            void main() {
              vec3 pos = position;
              float wingDist = max(0.0, abs(pos.x) - 10.0);
              pos.z += wingDist * uFlap * 0.65;
              pos.y += wingDist * uFlap * 0.28;

              vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
              vec3 viewNorm = normalize(normalMatrix * normal);
              vec2 offsetDir = length(viewNorm.xy) > 0.0001 ? normalize(viewNorm.xy) : vec2(0.0, 1.0);
              clipPos.xy += offsetDir * (uPixelWidth / vec2(1440.0, 900.0)) * clipPos.w * 2.0;
              clipPos.z += 0.0005 * clipPos.w;
              gl_Position = clipPos;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3 uInkColor;
            void main() {
              gl_FragColor = vec4(uInkColor, 1.0);
            }
          `,
        });
        const hull = new THREE.Mesh(obj.geometry, outlineMat);
        obj.add(hull);
      }

      return { root: cloned, flapUniform };
    });

    return { gulls: specs, gullInstances: instances };
  }, [storkGltf.scene]);

  useFrame(({ clock }) => {
    if (!flockRef.current) return;
    const t = clock.getElapsedTime();
    flockRef.current.position.z = carZRef.current;

    flockRef.current.children.forEach((child, idx) => {
      const g = gulls[idx];
      const inst = gullInstances[idx];
      if (!g || !inst) return;

      // 偶发式振翅周期：每 7.2 秒周期中仅在前 1.35 秒内优雅扇动 3 次翅膀，其余 5.85 秒平展滑翔
      const cyclePeriod = 7.2;
      const flapDuration = 1.35;
      const localT = (t + g.phase * 1.85) % cyclePeriod;
      let flapVal = 0.0;
      if (localT < flapDuration) {
        const u = localT / flapDuration;
        const env = Math.sin(u * Math.PI);
        flapVal = Math.sin(u * Math.PI * 6.0) * env;
      }
      inst.flapUniform.value = flapVal;

      // 同步驱动 GLB 自带的 MorphTargets（若存在）
      inst.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.morphTargetInfluences && obj.morphTargetInfluences.length >= 2) {
          obj.morphTargetInfluences[0] = Math.max(0, flapVal * 0.85);
          obj.morphTargetInfluences[1] = Math.max(0, -flapVal * 0.85);
        }
      });

      child.position.x = g.x + Math.sin(t * 0.42 + g.phase) * 6.5;
      child.position.y =
        g.y + Math.cos(t * 0.75 + g.phase) * 1.2 + Math.abs(flapVal) * 0.28;
      child.rotation.z = Math.sin(t * g.speed + g.phase) * 0.12;
    });
  });

  return (
    <group ref={flockRef}>
      {gulls.map((g, i) => (
        <group
          key={i}
          position={[g.x, g.y, g.zOffset]}
          rotation={[0.08, 0.35, 0]}
          scale={g.scale}
        >
          <primitive object={gullInstances[i].root} />
        </group>
      ))}
    </group>
  );
}

/**
 * 世界空间流式悬浮气泡与迎风丝带（修复固定在镜头前游荡的问题）
 * - 所有气泡与丝带均分布在公路沿线世界空间 [carZ - 20m, carZ + 150m] 的循环走廊中；
 * - 随着车辆向前行驶，新的悬浮气泡与丝带源源不断从远方地平线浮现、迎面掠过车身两侧并向车后远去，绝不遮挡镜头中央视野。
 */
function EizinWindRibbonsAndConfetti({
  carZRef,
  seedOffset,
}: {
  carZRef: React.MutableRefObject<number>;
  seedOffset: number;
}) {
  const ribbonsGroupRef = useRef<THREE.Group>(null);
  const bubblesGroupRef = useRef<THREE.Group>(null);

  const { ribbons, bubbles } = useMemo(() => {
    const makeTaperedRibbonGeo = (len: number, amp: number, maxRad: number) => {
      const curvePts: THREE.Vector3[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        curvePts.push(
          new THREE.Vector3(
            (u - 0.5) * len * 0.45,
            Math.sin(u * Math.PI * 1.85) * amp + u * len * 0.28,
            (u - 0.5) * len
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const tubularSegments = 24;
      const radialSegments = 6;
      const frames = curve.computeFrenetFrames(tubularSegments, false);

      const positions: number[] = [];
      const normals: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= tubularSegments; i++) {
        const u = i / tubularSegments;
        const p = curve.getPointAt(u);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const r = Math.max(0.002, Math.pow(Math.sin(u * Math.PI), 1.35) * maxRad);

        for (let j = 0; j <= radialSegments; j++) {
          const v = (j / radialSegments) * Math.PI * 2;
          const cosV = Math.cos(v);
          const sinV = Math.sin(v);
          const nx = cosV * N.x + sinV * B.x;
          const ny = cosV * N.y + sinV * B.y;
          const nz = cosV * N.z + sinV * B.z;
          positions.push(p.x + r * nx, p.y + r * ny * 0.55, p.z + r * nz);
          normals.push(nx, ny, nz);
        }
      }

      const stride = radialSegments + 1;
      for (let i = 0; i < tubularSegments; i++) {
        for (let j = 0; j < radialSegments; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geo.setIndex(indices);
      return geo;
    };

    const g1 = makeTaperedRibbonGeo(4.2, 0.32, 0.036);
    const g2 = makeTaperedRibbonGeo(3.1, 0.24, 0.028);

    let seed = 4099;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const palette = ["#FF3B5C", "#FFE02E", "#38B6FF", "#FFFFFF", "#FF8A3D"];

    // 10 条分布在 520m 超长走廊两侧高空中的流线丝带（延长存在时间并柔和迎风漂浮）
    const ribbonItems = Array.from({ length: 10 }).map((_, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      return {
        lateral: side * (5.5 + rand() * 14.0),
        baseY: 4.8 + rand() * 9.5,
        baseZ: (i / 10) * 520.0 + rand() * 24.0,
        rotZ: side * (0.12 + rand() * 0.22),
        color: palette[i % palette.length],
        geo: i % 2 === 0 ? g1 : g2,
        phase: rand() * Math.PI * 2,
        speedZ: 1.8 + rand() * 1.4,
      };
    });

    // 56 颗空气中悬浮的彩色气泡与光斑微粒（520m 超长走廊 + 柔和漂浮，大幅延长视野停留时间）
    const bubbleItems = Array.from({ length: 56 }).map((_, i) => {
      const side = rand() > 0.48 ? 1 : -1;
      const lat = side * (3.2 + rand() * 18.0);
      return {
        lateral: lat,
        baseY: 0.9 + rand() * 14.0,
        baseZ: rand() * 520.0,
        scale: 0.045 + rand() * 0.065,
        color: palette[i % palette.length],
        phase: rand() * Math.PI * 2,
        speedZ: 1.5 + rand() * 1.5,
      };
    });

    return { ribbons: ribbonItems, bubbles: bubbleItems };
  }, []);

  const outlineMat = useMemo(() => getUniformInkOutlineMaterial(), []);
  const dotGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const carZ = carZRef.current;
    const loopLen = 520.0;

    if (ribbonsGroupRef.current) {
      ribbonsGroupRef.current.children.forEach((child, i) => {
        const r = ribbons[i];
        if (!r) return;
        const relZ =
          (((r.baseZ - carZ * 0.38 - t * r.speedZ) % loopLen) + loopLen) % loopLen -
          260.0;
        const worldZ = carZ + relZ;
        const roadS = sampleRoad(worldZ, seedOffset);
        child.position.set(
          roadS.position.x + r.lateral + Math.sin(t * 1.1 + r.phase) * 0.6,
          roadS.position.y + r.baseY + Math.cos(t * 1.6 + r.phase) * 0.35,
          worldZ
        );
        child.rotation.set(
          Math.sin(t * 1.4 + r.phase) * 0.12,
          roadS.yaw + Math.cos(t * 0.9 + r.phase) * 0.18,
          r.rotZ
        );
        const fade = 1.0 - THREE.MathUtils.smoothstep(Math.abs(relZ), 185, 258);
        child.scale.setScalar(Math.max(0.001, fade));
      });
    }

    if (bubblesGroupRef.current) {
      bubblesGroupRef.current.children.forEach((child, i) => {
        const b = bubbles[i];
        if (!b) return;
        const relZ =
          (((b.baseZ - carZ * 0.38 - t * b.speedZ) % loopLen) + loopLen) % loopLen -
          260.0;
        const worldZ = carZ + relZ;
        const roadS = sampleRoad(worldZ, seedOffset);
        child.position.set(
          roadS.position.x + b.lateral + Math.sin(t * 1.5 + b.phase) * 0.45,
          roadS.position.y + b.baseY + Math.sin(t * 2.1 + b.phase) * 0.28,
          worldZ
        );
        const fade = 1.0 - THREE.MathUtils.smoothstep(Math.abs(relZ), 185, 258);
        child.scale.setScalar(Math.max(0.0005, b.scale * fade));
      });
    }
  });

  return (
    <>
      <group ref={ribbonsGroupRef}>
        {ribbons.map((r, idx) => (
          <group key={`rib_${idx}`}>
            <mesh geometry={r.geo}>
              <meshBasicMaterial color={r.color} />
            </mesh>
            <mesh geometry={r.geo} material={outlineMat} />
          </group>
        ))}
      </group>

      <group ref={bubblesGroupRef}>
        {bubbles.map((b, idx) => (
          <group key={`bub_${idx}`} scale={b.scale}>
            <mesh geometry={dotGeo}>
              <meshBasicMaterial color={b.color} />
            </mesh>
            <mesh geometry={dotGeo} material={outlineMat} />
          </group>
        ))}
      </group>
    </>
  );
}

export function CityPopSkyAndOcean({
  carZRef,
  seed,
  oceanMaterial,
  timeOfDay = "noon",
}: CityPopSkyAndOceanProps) {
  const skyGroupRef = useRef<THREE.Group>(null);
  const cloudMeshRef = useRef<THREE.Mesh>(null);
  const yachtsGroupRef = useRef<THREE.Group>(null);
  const seedOffset = seed * 0.17;

  // 天空巨型渐变天幕 Shader
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTopColor: {
            value: new THREE.Color(
              timeOfDay === "sunset" ? "#1A0F4E" : CITY_POP_PALETTE.skyTop
            ),
          },
          uMidColor: {
            value: new THREE.Color(
              timeOfDay === "sunset" ? "#D63874" : CITY_POP_PALETTE.skyMid
            ),
          },
          uHorizonColor: {
            value: new THREE.Color(
              timeOfDay === "sunset" ? "#FFA43E" : CITY_POP_PALETTE.skyHorizon
            ),
          },
        },
        vertexShader: /* glsl */ `
          varying vec3 vLocalPos;
          void main() {
            vLocalPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uHorizonColor;
          varying vec3 vLocalPos;

          float hash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }

          void main() {
            vec3 dir = normalize(vLocalPos);
            float h = clamp(dir.y, 0.0, 1.0);
            // 复刻参考图 1 & 2 永井博地平线点彩颗粒过渡（Stippled Canvas Grain）
            float grain = (hash21(floor(dir.xz * 950.0 + dir.y * 650.0)) - 0.5) * 0.045 * (1.0 - smoothstep(0.0, 0.35, h));
            float hg = clamp(h + grain, 0.0, 1.0);
            vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.19, hg));
            col = mix(col, uTopColor, smoothstep(0.19, 0.68, hg));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [timeOfDay]
  );

  // 单一连续 4096x1024 全景入道云材质（彻底消除多平面拼接断层与云底水平截断条带）
  const cloudMatPanorama = useMemo(() => createCityPopCloudMaterial(2), []);
  // 游艇破浪水面尾迹与 3D 噪波翻卷浪冠 ShaderMaterial
  const yachtWakeMat = useMemo(() => createYachtWakeMaterial(), []);
  const yacht3DSplashMat = useMemo(() => getYacht3DSplashMaterial(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const z = carZRef.current;

    const horizonHex =
      timeOfDay === "sunset" ? "#FFA43E" : CITY_POP_PALETTE.skyHorizon;
    oceanMaterial.uniforms.uTime.value = t;
    oceanMaterial.uniforms.uHorizonColor.value.set(horizonHex);
    yachtWakeMat.uniforms.uTime.value = t;
    yacht3DSplashMat.uniforms.uTime.value = t;

    if (cloudMeshRef.current) {
      // 360° 全景积雨云缓慢绕场景水平旋转，模拟高空云层平稳飘动
      cloudMeshRef.current.rotation.y = -t * 0.012;
    }

    if (skyGroupRef.current) {
      skyGroupRef.current.position.z = z;
      const horizonSample = sampleRoad(z + 240, seedOffset);
      skyGroupRef.current.position.x = THREE.MathUtils.lerp(
        skyGroupRef.current.position.x,
        horizonSample.position.x * 0.45,
        0.05
      );
    }

    // 游艇与帆船在右侧海湾中沿 Z 轴前后双向范围 [-340m, +340m] 平滑航行，在远方渐显渐隐区间内自然进出
    if (yachtsGroupRef.current) {
      const specs = [
        { offset: 385, speed: 12, lateral: -26 },
        { offset: 455, speed: 8, lateral: -56 },
        { offset: 215, speed: 10, lateral: -42 },
      ];
      yachtsGroupRef.current.children.forEach((yacht, idx) => {
        const sp = specs[idx];
        if (!sp) return;
        const loopLen = 680;
        const relZ =
          (((sp.offset - z * 0.32 + t * sp.speed) % loopLen) + loopLen) %
          loopLen;
        const worldZ = z + relZ - 340;
        const roadAtYacht = sampleRoad(worldZ, seedOffset);

        yacht.position.set(
          roadAtYacht.position.x + sp.lateral,
          ROAD_CONFIG.oceanElevation + Math.sin(t * 2.0 + idx) * 0.1,
          worldZ
        );
        yacht.rotation.y = roadAtYacht.yaw * 0.5;
      });
    }
  });

  return (
    <>
      <group ref={skyGroupRef}>
        {/* 1. 钴蓝渐变天穹（扩大至 920m 置于最底层背景） */}
        <mesh renderOrder={-2}>
          <sphereGeometry args={[920, 32, 20]} />
          <primitive object={skyMat} attach="material" />
        </mesh>

        {/* 2. 360° 环绕无接缝全景积雨云与地平线层云天幕（半径扩大至 860m 置于远山后方，彻底杜绝山体与云层穿模） */}
        <mesh ref={cloudMeshRef} position={[0, 155, 0]} renderOrder={-1}>
          <cylinderGeometry args={[860, 860, 360, 96, 1, true]} />
          <primitive object={cloudMatPanorama} attach="material" />
        </mesh>

        {/* 3a. 前方海湾远景：远山与海岛（推至海湾外侧 x = -235m, z = +515m，完全处于右侧海面并远离左侧公路建筑群，彻底杜绝建筑与山体穿模） */}
        <group
          position={[-235, ROAD_CONFIG.oceanElevation, 515]}
          rotation={[0, Math.PI, 0]}
        >
          <CityPopGlbInstance
            assetKey="distantIsland"
            scale={[1.15, 1.18, 1.08]}
          />
        </group>

        {/* 3b. 后方海湾远景：远山与海岛 (x = -235m, z = -515m，供车头回看视角 FRONT 远眺) */}
        <group
          position={[-235, ROAD_CONFIG.oceanElevation, -515]}
          rotation={[0, 0.22, 0]}
        >
          <CityPopGlbInstance
            assetKey="distantIsland"
            scale={[1.15, 1.18, 1.08]}
          />
        </group>
      </group>

      {/* 4. 海湾中基于用户提供的 3 款豪华游艇 GLB 模型 (带动态翻涌的 3D 浪冠与飞沫) */}
      <group ref={yachtsGroupRef}>
        <GlbYacht
          assetKey="userYachtNeoland"
          scale={1.0}
          wakeMaterial={yachtWakeMat}
          phaseOffset={0.0}
          isSunset={timeOfDay === "sunset"}
        />
        <GlbYacht
          assetKey="userYachtMotor"
          scale={1.0}
          wakeMaterial={yachtWakeMat}
          phaseOffset={2.1}
          isSunset={timeOfDay === "sunset"}
        />
        <GlbYacht
          assetKey="userYachtClassic"
          scale={1.0}
          wakeMaterial={yachtWakeMat}
          phaseOffset={4.2}
          isSunset={timeOfDay === "sunset"}
        />
      </group>

      {/* 5. 空中基于真实 GLB 模型的海鸥群 */}
      <GlbSeagullFlock carZRef={carZRef} />

      {/* 6. 世界空间流式悬浮气泡与迎风丝带（从远处不断涌现并向车后掠过） */}
      <EizinWindRibbonsAndConfetti carZRef={carZRef} seedOffset={seedOffset} />
    </>
  );
}
