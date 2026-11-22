import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  CITYPOP_THEME_UNIFORMS,
  getCityPopGradientMap,
  getUniformInkOutlineMaterial,
} from "./cityPopShaders";
import { CITY_POP_PALETTE } from "./highwayCurve";

const DELOREAN_GLB_PATH = "/scan-glb/1985_delorean_dmc-12_time_machine_bttf.glb";

let cachedCarShadowTex: THREE.CanvasTexture | null = null;
/**
 * 复刻参考图 1 & 2 铃木英人风格的汽车斜向投射硬边落影（含左侧轮下斜向延伸轮廓与边缘点彩排线肌理）
 */
function getCarOrganicShadowTexture(): THREE.CanvasTexture {
  if (cachedCarShadowTex) return cachedCarShadowTex;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 512, 512);

  // 干净利落的流线型车底硬边落影（消除右侧条形码状伪影，贴合车身与四轮外沿轮廓）
  ctx.fillStyle = "#1E161B";
  ctx.beginPath();
  ctx.roundRect(88, 44, 336, 424, 58);
  ctx.fill();

  // 四个车轮接地处的微凸圆弧压影
  const wheelSpots = [
    [88, 128],
    [424, 128],
    [88, 384],
    [424, 384],
  ];
  for (const [wx, wy] of wheelSpots) {
    ctx.beginPath();
    ctx.ellipse(wx, wy, 22, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedCarShadowTex = tex;
  return tex;
}

export interface DeLoreanCarProps {
  /** 车辆当前行驶速度（米/秒） */
  speed: number;
  /** 换道横向转向角（弧度） */
  steerAngle: number;
  /** 是否处于车内第一人称驾驶视角（自动降低前挡风玻璃不透明度以保证视野通透） */
  isCockpitView: boolean;
  /** 模型加载完成回调 */
  onLoaded?: () => void;
}

interface WheelBinding {
  mesh: THREE.Mesh;
  isFront: boolean;
  isRight: boolean;
}

export function DeLoreanCar({
  speed,
  steerAngle,
  isCockpitView,
  onLoaded,
}: DeLoreanCarProps) {
  const gltf = useGLTF(DELOREAN_GLB_PATH);
  const spinAngleRef = useRef(0);

  // 克隆场景并执行 City Pop 赛璐璐化 + 车轮节点直接绑定
  const { carRoot, wheels, windowMats } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const wheelList: WheelBinding[] = [];
    const winMatList: THREE.MeshToonMaterial[] = [];
    const gradientMap = getCityPopGradientMap();

    // 先收集原始网格列表，避免在 traverse 过程中执行 mesh.add() 导致无限递归栈溢出
    const sourceMeshes: THREE.Mesh[] = [];
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        sourceMeshes.push(obj);
      }
    });

    for (const mesh of sourceMeshes) {
      const matName =
        (Array.isArray(mesh.material)
          ? mesh.material[0]?.name
          : mesh.material?.name) || "";

      // 识别节点链路名称以判断车轮、车窗与车身外壳
      let chainName = mesh.name;
      let p: THREE.Object3D | null = mesh.parent;
      while (p) {
        if (p.name) chainName += " " + p.name;
        p = p.parent;
      }

      const isWheel =
        chainName.includes("3DWheel") || matName.includes("3DWheel");
      const isFrontWheel =
        isWheel &&
        (chainName.includes("Front L") ||
          chainName.includes("Front_L") ||
          chainName.includes("Front R") ||
          chainName.includes("Front_R"));
      const isRightWheel =
        isWheel &&
        (chainName.includes("Front R") ||
          chainName.includes("Front_R") ||
          chainName.includes("Rear R") ||
          chainName.includes("Rear_R"));
      const isWindow =
        chainName.includes("Window") ||
        matName.includes("Window") ||
        matName.includes("glass");
      const isEmissiveFlux =
        chainName.includes("LightEmissive") ||
        matName.includes("LightEmissive") ||
        matName.includes("red_glas") ||
        matName.includes("orange_glass");
      const isBodyPaint = chainName.includes("Paint_Geo");
      const isInterior =
        chainName.includes("Interior") ||
        matName.includes("Interior") ||
        chainName.includes("Coloured_Geo") ||
        matName.includes("Coloured") ||
        chainName.includes("GrilleNoAlpha9") ||
        matName.includes("GrilleNoAlpha9") ||
        chainName.includes("Textured") ||
        matName.includes("Textured");

      // 1. 车轮节点绑定（车轮局部几何体已位于 Y=0, Z=0 车轴中心，右侧车轮父节点带 180° 镜像需反向绕 X 旋转）
      if (isWheel) {
        mesh.rotation.order = "YXZ";
        wheelList.push({ mesh, isFront: isFrontWheel, isRight: isRightWheel });

        // 为车轮叠加结构折痕墨线与随轮旋转的赛璐璐轮毂辐条/胎侧白边动感弧
        if (mesh.geometry) {
          const wheelEdges = new THREE.EdgesGeometry(mesh.geometry, 18);
          const edgeSegs = new THREE.LineSegments(
            wheelEdges,
            new THREE.LineBasicMaterial({ color: CITY_POP_PALETTE.inkBlack })
          );
          mesh.add(edgeSegs);

          const outerX = 0.195;
          const spokeGroup = new THREE.Group();
          spokeGroup.position.set(outerX, 0, 0);

          for (let s = 0; s < 3; s++) {
            const spoke = new THREE.Mesh(
              new THREE.BoxGeometry(0.014, 0.38, 0.032),
              new THREE.MeshBasicMaterial({
                color: s === 0 ? "#FFFDF5" : "#5CC8FF",
              })
            );
            spoke.rotation.x = (s * Math.PI) / 3;
            spokeGroup.add(spoke);
          }

          for (const arcAngle of [0.25, Math.PI + 0.25]) {
            const arcGeo = new THREE.RingGeometry(
              0.205,
              0.248,
              14,
              1,
              arcAngle,
              0.92
            );
            const arcMesh = new THREE.Mesh(
              arcGeo,
              new THREE.MeshBasicMaterial({
                color: "#FFFDF5",
                side: THREE.DoubleSide,
              })
            );
            arcMesh.rotation.y = Math.PI / 2;
            spokeGroup.add(arcMesh);
          }

          mesh.add(spokeGroup);
        }
      }

      // 2. 材质转换为 City Pop 赛璐璐风格
      const srcMat = (
        Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      ) as THREE.MeshStandardMaterial | undefined;

      if (isWindow) {
        const winMat = new THREE.MeshToonMaterial({
          color: new THREE.Color("#69C8FF"),
          gradientMap,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        });
        mesh.material = winMat;
        winMatList.push(winMat);
      } else if (isEmissiveFlux) {
        const emMap = srcMat?.emissiveMap ?? srcMat?.map ?? null;
        if (emMap) {
          emMap.colorSpace = THREE.SRGBColorSpace;
        }
        mesh.material = new THREE.MeshToonMaterial({
          color: new THREE.Color("#FFFFFF"),
          map: emMap,
          emissive: emMap ? new THREE.Color("#FFFFFF") : new THREE.Color("#00E5FF"),
          emissiveMap: emMap,
          emissiveIntensity: emMap ? 1.85 : 1.65,
          gradientMap,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      } else if (srcMat) {
        const baseColor = srcMat.color
          ? srcMat.color.clone()
          : new THREE.Color("#FFFFFF");
        if (srcMat.map) {
          srcMat.map.colorSpace = THREE.SRGBColorSpace;
          srcMat.map.anisotropy = 4;
        }
        // 给拉丝不锈钢车身注入晴空天蓝插画色温，并通过自定义片元着色器注入铃木英人 4 阶硬边色块反射
        if (isBodyPaint) {
          baseColor.set("#E6F2FF");
        } else if (isInterior) {
          baseColor.set("#FFFFFF");
        }
        const toonMat = new THREE.MeshToonMaterial({
          color: baseColor,
          map: srcMat.map ?? null,
          normalMap: isInterior ? null : (srcMat.normalMap ?? null),
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
          gradientMap,
          alphaMap: srcMat.alphaMap ?? null,
          transparent: srcMat.transparent ?? false,
          opacity: srcMat.opacity ?? 1,
          side: srcMat.side ?? THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        if (!isWheel) {
          toonMat.onBeforeCompile = (shader) => {
            shader.uniforms.uSunset = CITYPOP_THEME_UNIFORMS.uSunset;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <common>",
              `#include <common>\nuniform float uSunset;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <opaque_fragment>",
              isInterior
                ? /* glsl */ `
                  // 车内驾驶舱专属 4 阶色彩分层光影着色器：
                  // 1. 为方向盘、仪表台遮光罩、车门内饰板与换挡杆皮套赋予深靛蓝 -> 钢青蓝 -> 晴空蓝高光四阶立体光影分层 + 色阶交界细墨线
                  // 2. 为时间电路金属盒 (Time Circuits) 与数字小键盘赋予冷银蓝三阶金属色层，消除原先误用车身粉色腰线导致的粉斑，并完整保留仪表盘白字刻度与红绿黄彩灯细节
                  vec3 nView = normalize(vNormal);
                  float curveLit = (nView.y * 0.56 - nView.x * 0.38) * 0.5 + 0.46;
                  float cabinWave = sin(vViewPosition.x * 3.8 - vViewPosition.y * 4.2) * 0.22;
                  float lit = clamp(curveLit + cabinWave, 0.0, 1.0);
                  float fwL = clamp(fwidth(lit), 0.0008, 0.012);

                  float texSat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
                  float texLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));

                  if (texSat > 0.32) {
                    // 高饱和度细节（红黄绿时间电路标签、彩色排线、仪表红区指针、VOLTS/TEMP 彩标）：保留鲜明原色并提亮
                    vec3 satBoost = lit < 0.34 ? vec3(0.82, 0.88, 1.00) : vec3(1.18, 1.12, 1.04);
                    outgoingLight = diffuseColor.rgb * satBoost;
                  } else if (texLuma > 0.14) {
                    // 仪表盘白色数字刻度 (MPH / RPM / 85)、小键盘白底与时间电路拉丝铝面板：清透冷银白三阶金属分层（消除粉斑）
                    vec3 metalShadow = mix(vec3(0.42, 0.58, 0.82), vec3(0.36, 0.25, 0.52), uSunset);
                    vec3 metalMid    = mix(vec3(0.76, 0.88, 0.98), vec3(0.84, 0.58, 0.64), uSunset);
                    vec3 metalHigh   = mix(vec3(1.04, 1.03, 1.00), vec3(1.12, 0.88, 0.70), uSunset);
                    vec3 mTint = lit < 0.36 ? metalShadow : (lit < 0.68 ? metalMid : metalHigh);
                    float mDist = min(abs(lit - 0.36), abs(lit - 0.68));
                    if (mDist < fwL * 0.55 && texLuma < 0.65) {
                      mTint = mix(mTint, vec3(0.05, 0.07, 0.12), 0.85);
                    }
                    vec3 cleanBase = mix(vec3(texLuma * 1.18), diffuseColor.rgb, 0.25);
                    outgoingLight = cleanBase * mTint;
                  } else {
                    // 车内全部深色皮革与搪塑部件（方向盘、仪表台遮光罩、车门内饰板、中控台）：4 阶立体色彩分层光影 + 色层分界细墨线
                    vec3 leatherDeep = vec3(0.010, 0.018, 0.045); // 深群青背光底面（兼顾表盘高对比深底）
                    vec3 leatherMid  = vec3(0.028, 0.050, 0.110); // 深靛蓝过渡皮面
                    vec3 leatherLit  = vec3(0.062, 0.108, 0.215); // 暗钢青蓝受光皮面
                    vec3 leatherRim  = vec3(0.125, 0.205, 0.360); // 方向盘/遮光罩受光高光层

                    vec3 lCol = leatherDeep;
                    if (lit > 0.68) {
                      lCol = leatherRim;
                    } else if (lit > 0.48) {
                      lCol = leatherLit;
                    } else if (lit > 0.28) {
                      lCol = leatherMid;
                    }

                    float bDist = min(abs(lit - 0.28), min(abs(lit - 0.48), abs(lit - 0.68)));
                    if (bDist < fwL * 0.55) {
                      lCol = mix(lCol, vec3(0.04, 0.05, 0.09), 0.88); // 皮革色层分界细黑线（约 1px，对齐远山与积雨云）
                    }
                    outgoingLight = lCol;
                  }
                  #include <opaque_fragment>
                `
                : /* glsl */ `
                  // 复刻参考图 1 & 2 铃木英人汽车外壳四阶高对比硬边色温分层反射
                  vec3 nView = normalize(vNormal);
                  vec3 vDir = normalize(vViewPosition);
                  vec3 refl = reflect(-vDir, nView);
                  float skyReflect = clamp(refl.y * 0.65 + 0.45, 0.0, 1.0);
                  float sunDot = clamp(dot(nView, normalize(vec3(-0.58, 0.66, 0.48))) * 0.5 + 0.5, 0.0, 1.0);
                  float bandSignal = mix(sunDot, skyReflect, 0.56);

                  vec3 bandShadow = mix(vec3(0.09, 0.18, 0.42), vec3(0.133, 0.078, 0.271), uSunset); // #172E6B / #221445
                  vec3 bandCyan   = mix(vec3(0.24, 0.65, 0.96), vec3(0.620, 0.267, 0.478), uSunset); // #3DA6F5 / #9E447A
                  vec3 bandCoral  = mix(vec3(1.00, 0.50, 0.61), vec3(1.000, 0.478, 0.349), uSunset); // #FF809C / #FF7A59
                  vec3 bandBody   = mix(vec3(0.79, 0.91, 0.99), vec3(0.949, 0.753, 0.722), uSunset); // #C9E8FC / #F2C0B8
                  vec3 bandHigh   = mix(vec3(1.00, 1.00, 0.99), vec3(1.000, 0.918, 0.820), uSunset); // #FFFFFC / #FFEAD1

                  vec3 celCol = bandShadow;
                  if (bandSignal > 0.70) {
                    celCol = bandHigh;
                  } else if (bandSignal > 0.50) {
                    celCol = bandBody;
                  } else if (${isBodyPaint ? "true" : "false"} && bandSignal > 0.40 && abs(nView.y) < 0.64) {
                    celCol = bandCoral;
                  } else if (bandSignal > 0.22) {
                    celCol = bandCyan;
                  }

                  float texSat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
                  float texLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));

                  if (texSat > 0.16) {
                    vec3 stepTint = sunDot < 0.28 ? vec3(0.55, 0.68, 0.92) : vec3(1.08, 1.05, 1.0);
                    outgoingLight = diffuseColor.rgb * stepTint;
                  } else if (texLuma < 0.16 && !${isBodyPaint ? "true" : "false"}) {
                    outgoingLight = mix(diffuseColor.rgb, bandShadow * 0.55, 0.65);
                  } else {
                    outgoingLight = mix(outgoingLight, celCol, ${isBodyPaint ? "0.92" : "0.78"});
                  }
                  #include <opaque_fragment>
                `
            );
          };
        }
        mesh.material = toonMat;
      }

      // 3. 为主车身外壳、车内仪表台与后部金属构件叠加恒定屏幕像素宽度法线描边与结构折痕边线
      if (!isWheel && !isWindow && !isEmissiveFlux && mesh.geometry) {
        const outlineMesh = new THREE.Mesh(
          mesh.geometry,
          getUniformInkOutlineMaterial()
        );
        mesh.add(outlineMesh);

        if (isBodyPaint || isInterior) {
          const bodyEdges = new THREE.EdgesGeometry(
            mesh.geometry,
            isInterior ? 34 : 32
          );
          mesh.add(
            new THREE.LineSegments(
              bodyEdges,
              new THREE.LineBasicMaterial({ color: CITY_POP_PALETTE.inkBlack })
            )
          );
        }
      }
    }

    return { carRoot: cloned, wheels: wheelList, windowMats: winMatList };
  }, [gltf.scene]);

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  // 车内第一人称视角时降低车窗不透明度，确保前挡风玻璃视野清澈明亮
  useEffect(() => {
    const targetOpacity = isCockpitView ? 0.06 : 0.36;
    for (const mat of windowMats) {
      mat.opacity = targetOpacity;
      mat.needsUpdate = true;
    }
  }, [isCockpitView, windowMats]);

  // 每帧更新四轮旋转与前轮转向角（避开 60fps 90° 频闪驻波区间，使车轮正转清晰可见）
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const visualAngularSpeed = speed * 0.58;
    spinAngleRef.current =
      (spinAngleRef.current + visualAngularSpeed * dt) % (Math.PI * 200);

    for (const w of wheels) {
      w.mesh.rotation.x = w.isRight
        ? -spinAngleRef.current
        : spinAngleRef.current;
      if (w.isFront) {
        w.mesh.rotation.y = THREE.MathUtils.lerp(
          w.mesh.rotation.y,
          steerAngle * 0.65,
          dt * 12
        );
      }
    }
  });

  const carShadowTex = useMemo(() => getCarOrganicShadowTexture(), []);

  return (
    <group>
      {/* DeLorean 主体模型 */}
      <primitive object={carRoot} />

      {/* 车底干净利落的流线型硬边落影 */}
      <mesh
        position={[0.08, 0.025, -0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[2.55, 5.45]} />
        <meshBasicMaterial
          map={carShadowTex}
          transparent
          alphaTest={0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

useGLTF.preload(DELOREAN_GLB_PATH);
