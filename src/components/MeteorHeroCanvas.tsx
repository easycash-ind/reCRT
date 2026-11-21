import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  Color,
  MathUtils,
  NoToneMapping,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
} from "three";
import type { HelmetHeadPose } from "./helmet-hud/useHelmetHeadTracking";
import {
  DEFAULT_HELMET_HUD_SETTINGS,
  type HelmetHudSettings,
} from "./helmet-hud/HelmetHudSettingsPanel";

export interface MeteorHeroCanvasProps {
  onReady?: () => void;
  headPoseRef?: RefObject<HelmetHeadPose>;
  hudSettings?: HelmetHudSettings;
}

class MeteorErrorBoundary extends Component<
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

function StaticMeteorFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-[22%] h-[220px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-80 blur-[36px]"
        style={{
          background:
            "radial-gradient(ellipse at 30% 70%, rgba(255,255,255,0.9) 0%, rgba(56,189,248,0.65) 16%, rgba(52,211,153,0.45) 28%, rgba(139,92,246,0.55) 48%, rgba(0,0,0,0) 70%)",
          transform: "translate(-50%, -50%) rotate(-35deg)",
        }}
      />
    </div>
  );
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * 1:1 还原视频中的 After Effects 6 步程序化流星合成管线：
 * 1. Fractal Noise + Optical Flares（高速流动分形噪波 + 核心强光）
 * 2. Polar Coordinates（极坐标流线映射：横向对应角度 θ，纵向对应半径 r）
 * 3. CC Sphere + Mesh Warp（锥形抛物线收束 + V 字高能激波外沿）
 * 4. CC Radial Blur + Displacement Map + Wave Warp + S_Shake（径向拉伸模糊 + 波浪湍流置换 + 高频微震颤）
 * 5. 4-Point Star Core（头部旋转呼吸四角星芒 SDF）
 * 6. Final Composite（伴飞破空速度线 + 多色流光渐变）
 */
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uHelmetMode;
  uniform float uSaturation;
  uniform float uFlareIntensity;
  uniform float uFlareVignetteStart;
  varying vec2 vUv;

  // --- 2D Simplex Noise ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,
      0.366025403784439,
      -0.577350269189626,
      0.024390243902439
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // 低频平滑双阶噪波：用于生成大尺度块状等离子舌瓣（色块感，绝不产生细碎拉丝）
  float smoothLobeNoise(vec2 p) {
    float n1 = snoise(p) * 0.5 + 0.5;
    float n2 = snoise(p * vec2(1.65, 1.45) + vec2(3.7, -2.1)) * 0.5 + 0.5;
    return n1 * 0.68 + n2 * 0.32;
  }

  mat2 rot2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // 多相态虹彩等高线色块映射（还原 final_crop_01 / 03 / 09 的高纯度霓虹紫/洋红/电光蓝主尾羽 + 星核冰天青内芯 + 激波翼与游离斑块的翠绿/暖香槟金虹彩分层）
  vec3 iridescentColorBlocks(
    float colorEnergy,
    float tx,
    float ny,
    float localHueWave,
    float wingHighlight,
    float packetHighlight,
    float time
  ) {
    // 全局色相周期（在参考视频的标志性色相间流转：皇家霓虹紫/电光蓝 <-> 绯红洋红/暖金）
    float cycle = time * 0.38 + localHueWave * 0.55;
    float pSapphire = smoothstep(-0.30, 0.75, sin(cycle));               // 紫罗兰 <-> 电光宝蓝
    float pCrimson  = smoothstep(-0.25, 0.75, sin(cycle * 0.77 + 1.65)); // 皇家紫 <-> 霓虹洋红

    // 第 1 层（外缘与羽流尾端底色：零绿分量的高纯度深皇室紫 / 暗品红 / 深宝石蓝）
    vec3 cDeepViolet   = vec3(0.42, 0.00, 0.94);
    vec3 cDeepCrimson  = vec3(0.72, 0.01, 0.56);
    vec3 cDeepSapphire = vec3(0.10, 0.14, 0.92);
    vec3 outerBlock = mix(
      mix(cDeepViolet, cDeepCrimson, pCrimson * 0.58),
      cDeepSapphire,
      pSapphire * (1.0 - pCrimson * 0.55) * 0.48
    );

    // 第 2 层（主尾焰中后段核心色块：高饱和皇家蓝紫 / 霓虹洋红 / 电光钴蓝，避免互补通道同时拉高导致发灰发粉）
    vec3 cVividPurple  = vec3(0.66, 0.02, 1.00);
    vec3 cVividMagenta = vec3(0.96, 0.04, 0.74);
    vec3 cVividBlue    = vec3(0.16, 0.32, 1.00);
    vec3 mainBlock = mix(
      mix(cVividPurple, cVividMagenta, clamp(pCrimson * 0.62 + smoothstep(0.08, 0.36, tx) * 0.20, 0.0, 1.0)),
      cVividBlue,
      pSapphire * (1.0 - pCrimson * 0.50) * 0.52
    );

    // 第 3 层（中前段电光天青蓝，自然衔接紫色尾羽与冰青星核内芯）
    vec3 cElectricBlue = mix(vec3(0.22, 0.48, 1.00), vec3(0.16, 0.76, 1.00), pSapphire);
    // 第 4 层（前段星核后方冰天青色块）
    vec3 cIceCyan      = vec3(0.36, 0.92, 1.00);
    // 第 5 层（激波外翼与内部棱镜斑块专属：翡翠薄荷绿 & 高纯度亮金）
    vec3 cEmeraldMint   = vec3(0.18, 1.00, 0.58);
    vec3 cChampagneGold = vec3(1.00, 0.88, 0.24);
    // 第 6 层（核心与激波锋线纯白）
    vec3 cCrispWhite    = vec3(1.00, 0.99, 1.00);

    // 主体尾羽严格沿「深紫 -> 皇家紫/品红 -> 电光蓝 -> 冰青」高饱和宝石色弧过渡
    vec3 col = mix(outerBlock, mainBlock, smoothstep(0.16, 0.58, colorEnergy));

    // 电光蓝与冰天青集中在星核后方前段 (tx < 0.24)，确保中后段保留浓郁纯粹的皇家紫/洋红/钴蓝
    float blueBand = smoothstep(0.44, 0.70, colorEnergy) * smoothstep(0.25, 0.02, tx);
    col = mix(col, cElectricBlue, blueBand * 0.88);

    float cyanBand = smoothstep(0.58, 0.82, colorEnergy) * smoothstep(0.16, 0.01, tx);
    col = mix(col, cIceCyan, cyanBand * 0.90);

    // 局部虹彩棱镜色块（翡翠绿 -> 暖香槟金 -> 亮白锋线）：
    // 严格收敛在激波翼与高能棱镜核内部，避免大面积淡黄覆盖紫色尾羽造成降饱和发灰
    float localPrism = clamp(wingHighlight * 1.15 + packetHighlight * 0.95, 0.0, 1.0);
    float greenMask = smoothstep(0.16, 0.52, localPrism);
    float goldMask  = smoothstep(0.42, 0.78, localPrism + pCrimson * 0.10);
    float whitePeak = smoothstep(0.82, 0.97, localPrism);

    vec3 prismColor = mix(cEmeraldMint, cChampagneGold, goldMask);
    prismColor = mix(prismColor, cCrispWhite, whitePeak * 0.70);
    col = mix(col, prismColor, clamp(greenMask * 0.86, 0.0, 0.92));

    // 极高能星核根部纯白高光
    col = mix(col, cCrispWhite, smoothstep(0.88, 0.98, colorEnergy) * smoothstep(0.16, 0.0, tx));

    return col;
  }

  // 采样球面映射 + 饱满多股流线等离子羽流（还原前段清晰色块 + 后段 Camera Lens Blur 柔和散景画笔消散）
  void samplePlasmaField(
    float tx,
    float ny,
    float time,
    out float outColorEnergy,
    out float outPlumeFade,
    out float outHueWave,
    out float outWingHighlight,
    out float outPacketHighlight
  ) {
    // CC Sphere 球面经度映射：将 [-1, 1] 的截面坐标映射到球面角度 theta
    float clampedNy = clamp(ny, -0.995, 0.995);
    float theta = asin(clampedNy) / 1.5707963; // [-1, 1]

    // 纵向径向坐标：顺着飞行方向修长拉伸
    float rx = pow(max(tx, 0.0005), 0.70);

    // 柔和流体域微扭曲
    vec2 warp = vec2(
      snoise(vec2(rx * 1.45 - time * 1.55, theta * 1.15 + time * 0.38)),
      snoise(vec2(rx * 1.20 - time * 1.25 + 4.7, theta * 1.30 - time * 0.34))
    );

    // 模拟后段 Camera Lens Blur：随着 tx 增大，横向角度频率平滑降低，使尾端不会变成尖锐细刺，而是柔化为宽阔柔和的雾状笔触
    float rearBlurScale = mix(1.0, 0.58, smoothstep(0.18, 0.58, tx));

    // 前半球等离子帷幕 (Curtain A)
    vec2 uvA = vec2(
      rx * 1.35 - time * 2.20 + warp.x * 0.24,
      theta * 1.55 * rearBlurScale + time * 0.42 + warp.y * 0.25
    );
    float lobeA = smoothLobeNoise(uvA);

    // 后半球等离子帷幕 (Curtain B)
    vec2 uvB = vec2(
      rx * 1.55 - time * 2.55 - warp.y * 0.22 + 3.8,
      -theta * 1.70 * rearBlurScale - time * 0.46 + warp.x * 0.24 + 1.9
    );
    float lobeB = smoothLobeNoise(uvB);

    // 2~3 股宽幅主羽流分股场（Dynamic Plume Channels）：
    // 横向频率控制在 1.65，形成参考视频中 2~3 股饱满宽阔的紫/品红主尾羽，且在尾端柔和融合消散
    float cleftField = snoise(vec2(rx * 0.90 - time * 1.30, theta * 1.65 * rearBlurScale - time * 0.32 + warp.y * 0.25)) * 0.5 + 0.5;
    float channelRidges = smoothstep(0.18, 0.64, cleftField);
    float channelMod = mix(0.42, 1.0, channelRidges);

    // 每股宽幅主羽流的动态伸展长度与高斯柔化消散（无尖刺尾端）
    float centerProfile = exp(-pow(ny / 0.86, 2.0));
    float reachWave = snoise(vec2(theta * 1.25 + time * 0.34, time * 0.46 - rx * 0.32)) * 0.5 + 0.5;
    float streamReach = mix(0.44, 0.72, reachWave * (0.48 + 0.52 * centerProfile));
    float distRatio = clamp(tx / streamReach, 0.0, 1.0);
    // 平滑 S 型余弦-高斯衰减：尾端如柔焦光雾般自然融进纯黑背景
    float streamFade = pow(cos(distRatio * 1.5707963), 1.65) * mix(0.52, 1.0, channelRidges);

    // 内部饱满等离子舌瓣
    float rawLobes = lobeA * 0.56 + lobeB * 0.48;
    float structuredLobes = smoothstep(0.20, 0.70, rawLobes) * channelMod;

    // V 字两侧高能激波外翼（还原参考视频右上格与右下格两侧流线型亮金/翠绿/白边，在尾长 ~45% 处自然消隐）
    float wingProfile = exp(-pow((abs(ny) - 0.82) / 0.13, 2.0));
    float edgeFresnel = wingProfile *
                        exp(-tx * 4.4) *
                        smoothstep(0.46, 0.01, tx) *
                        (0.50 + 0.50 * smoothstep(0.28, 0.68, max(lobeA, lobeB)));

    // 内部动态游离虹彩色块斑（从星核后方剥离、在中前段 tx: 0.04 -> 0.32 滑行演变的暖金/翠绿/亮白色块岛，还原 final_crop_01 中央亮斑）
    float packetNoise = snoise(vec2(rx * 2.4 - time * 2.7, theta * 1.65 + warp.x * 0.35));
    float prismPacket = smoothstep(0.44, 0.78, packetNoise) *
                        smoothstep(0.02, 0.08, tx) *
                        smoothstep(0.36, 0.12, tx) *
                        exp(-pow(ny / 0.68, 2.0)) *
                        channelRidges;

    // 星核后方紧邻的冰天青扇形高能区（集中在前 16% 长度内，不拉出僵硬白刺）
    float noseShift = 0.04 * sin(time * 2.0);
    float noseCyanPocket = exp(-tx * 14.5) * exp(-pow((ny - noseShift) / 0.65, 2.0));
    // 星核根部纯白核心衔接
    float noseWhiteRoot = exp(-tx * 32.0) * exp(-pow(ny / 0.44, 2.0));

    // outColorEnergy 决定色块层级（中后段保持在 0.35~0.75 的饱满紫/品红/宝蓝区间）
    outColorEnergy = clamp(
      0.26 +
      structuredLobes * 0.54 +
      edgeFresnel * 0.55 +
      prismPacket * 0.52 +
      noseCyanPocket * 0.46 +
      noseWhiteRoot * 0.64,
      0.0,
      1.0
    );

    // outPlumeFade 决定尾羽的透明度与纵向柔焦消散包络
    float corePresence = clamp(structuredLobes * 0.92 + noseCyanPocket * 0.75 + noseWhiteRoot, 0.0, 1.0);
    outPlumeFade = clamp(
      corePresence * streamFade + edgeFresnel * 0.90 + prismPacket * 0.70,
      0.0,
      1.0
    );

    outHueWave = snoise(vec2(rx * 1.15 - time * 1.05, theta * 0.95 + time * 0.28));
    outWingHighlight = clamp(edgeFresnel * 1.15, 0.0, 1.0);
    outPacketHighlight = clamp(prismPacket * 1.25, 0.0, 1.0);
  }

  // 四角星核 SDF（还原参考视频底部中间格与右下角 Final 标志性的锐利四角星，无圆形光泡）
  void fourPointStar(vec2 p, float rotAngle, float scale, out float coreBody, out float starHalo) {
    vec2 sp = rot2d(rotAngle) * (p / scale);
    vec2 a = abs(sp);
    // 凹四边形星芒距离场：饱满锐利的四角星几何轮廓
    float starMetric = pow(a.x, 0.46) + pow(a.y, 0.46);
    float crispBody = smoothstep(0.92, 0.52, starMetric);
    // 沿星芒四角的锐利十字锋线
    float crossGleam = (exp(-a.x * 26.0) * exp(-a.y * 4.8) + exp(-a.y * 26.0) * exp(-a.x * 4.8)) * exp(-length(sp) * 2.5);
    coreBody = clamp(crispBody + crossGleam * 0.55, 0.0, 1.0);
    // 紧贴四角星自身凹四边形轮廓的极窄微光包边（仅 2~3px 宽，不向外发散）
    starHalo = smoothstep(1.05, 0.68, starMetric) * exp(-length(sp) * 3.8);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  vec3 applySceneSaturation(vec3 color, float sat) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return max(mix(vec3(luma), color, sat), vec3(0.0));
  }

  // 真实物理光学镜头角落色散光晕（恢复柔和漫射的光学渐变边缘，同时保持四角内凹弧形分布，无生硬瞳孔环边）
  vec3 cornerChromaticLensFlare(
    vec2 p,
    vec2 uv,
    vec2 starScreenPos,
    vec2 mouse,
    float time,
    float flareIntensity,
    float vignetteStart
  ) {
    if (flareIntensity <= 0.0001) return vec3(0.0);

    // 光学镜头反对称偏心：当视角(mouse)转动或光源偏心时，色散光晕中心随视角产生真实的物理位移
    vec2 flareShift = -starScreenPos * vec2(0.055, 0.065) + mouse * vec2(0.038, 0.032);
    vec2 normVp = (uv - flareShift) * vec2(1.14, 1.08);
    float r = length(normVp);
    vec2 physicalVp = p - flareShift * vec2(1.7778, 1.0);
    float ang = atan(physicalVp.y, physicalVp.x);

    // 随渐晕起点同步平移色散带中心，保证无论调大或调小渐晕起点，内侧始终保持柔和漫射羽化而不产生生硬截断
    float rShift = vignetteStart - 0.64;

    // 宽跨度柔和径向渐晕遮罩（完全依靠宽高斯色散带自然漫射衰减，不设生硬的内圈截断线，消除“瞳孔感”）
    float softCornerMask =
      smoothstep(vignetteStart, vignetteStart + 0.14, r) *
      smoothstep(0.96 + rShift * 0.5, 0.80 + rShift * 0.5, r);
    // 进一步柔和抑制正上/正下与正左/正右边缘中点残余，仅使用极平缓的角落角度权重而不改变径向内凹等值线
    float diagWeight = pow(sin(ang * 2.0), 2.0);
    softCornerMask *= smoothstep(0.10, 0.65, diagWeight);

    // 随视角转动的动态偏光强度：转头朝向某侧时，对应光学对角的色散响应产生真实强弱变化
    float viewBias = 0.86 + 0.38 * dot(normalize(uv + 0.0001), vec2(-mouse.x, mouse.y));
    softCornerMask *= clamp(viewBias, 0.45, 1.32);

    if (softCornerMask < 0.002) return vec3(0.0);

    // 柔和放射状微衍射条纹（降低生硬对比度，还原上一版自然的光学拉丝质感）
    float ray1 = sin(ang * 48.0 + mouse.x * 3.6) * 0.5 + 0.5;
    float ray2 = snoise(vec2(ang * 16.0, r * 2.4 - time * 0.14)) * 0.5 + 0.5;
    float ray3 = snoise(vec2(ang * 34.0 + 4.1, r * 1.8)) * 0.5 + 0.5;
    float radialRays = mix(0.42, 1.18, ray1 * 0.30 + ray2 * 0.45 + ray3 * 0.25);

    // 恢复上一版宽裕柔和的径向高斯光谱色散带（内侧暖红琥珀漫射渐隐 -> 中层黄绿 -> 外圈青绿冷光）
    float bandRed   = exp(-pow((r - (0.695 + rShift)) / 0.052, 2.0));
    float bandAmber = exp(-pow((r - (0.735 + rShift)) / 0.048, 2.0));
    float bandGreen = exp(-pow((r - (0.772 + rShift)) / 0.045, 2.0));
    float bandCyan  = exp(-pow((r - (0.810 + rShift)) / 0.042, 2.0));

    vec3 dispersionCol =
      vec3(0.96, 0.24, 0.08) * bandRed * 0.92 +
      vec3(0.98, 0.64, 0.12) * bandAmber * 0.78 +
      vec3(0.28, 0.92, 0.46) * bandGreen * 0.74 +
      vec3(0.10, 0.80, 0.90) * bandCyan * 0.86;

    // 最外圈（角落最外缘）极细微的衍射光环，而非内圈
    float outerApertureRing = exp(-pow((r - (0.852 + rShift)) / 0.012, 2.0)) * 0.22;
    vec3 ringCol = mix(vec3(0.85, 0.42, 0.22), vec3(0.28, 0.85, 0.78), 0.5 + 0.5 * cos(ang * 2.0));

    vec3 flare = (dispersionCol * radialRays + ringCol * outerApertureRing) * softCornerMask * flareIntensity;
    return flare;
  }

  float pinpointStarLayer(vec2 uv, float scale, float seed, float time) {
    vec2 gv = fract(uv * scale) - 0.5;
    vec2 id = floor(uv * scale);
    float h = hash21(id + seed);
    if (h < 0.948) return 0.0;
    vec2 offset = (vec2(hash21(id + seed + 1.37), hash21(id + seed + 2.91)) - 0.5) * 0.68;
    float d = length(gv - offset);
    float twinkle = 0.72 + 0.28 * sin(time * (1.1 + fract(h * 19.3) * 2.4) + h * 62.83);
    float size = mix(0.028, 0.052, smoothstep(0.948, 1.0, h));
    return smoothstep(size, 0.0, d) * twinkle * smoothstep(0.948, 0.998, h);
  }

  void main() {
    // 归一化屏幕坐标：中心 (0, 0)，修正宽高比
    vec2 uv = vUv - 0.5;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y);

    // First-person helmet camera subtle roll & look-around parallax (active in V4 helmet mode)
    float headRoll = -uMouse.x * 0.016 * uHelmetMode;
    vec2 pCam = rot2d(headRoll) * p;

    // In V4 helmet mode: scale meteor up (~1.46x) and position it in the upper-middle visor field (y: 0.068)
    vec2 heroCenter = mix(
      vec2(0.015 + uMouse.x * 0.03, 0.165 + uMouse.y * 0.02),
      vec2(0.035 - uMouse.x * 0.046, 0.068 - uMouse.y * 0.034),
      uHelmetMode
    );
    float meteorScale = mix(1.0, 1.46, uHelmetMode);
    vec2 local = (pCam - heroCenter) / meteorScale;

    // S_Shake：极轻微高频微幅能量震颤
    vec2 shake = vec2(
      sin(uTime * 52.0) + cos(uTime * 79.0),
      cos(uTime * 61.0) - sin(uTime * 87.0)
    ) * 0.0009;
    local += shake;

    // 旋转坐标系：使 +x 方向指向右上方 (↗ 约 29°)，星核朝向左下方 (↙) 破空俯冲
    float tailAngle = mix(
      0.51 + uMouse.y * 0.02,
      0.51 - uMouse.y * 0.018 + uMouse.x * 0.010,
      uHelmetMode
    );
    vec2 mp = rot2d(tailAngle) * local;

    // 星核位于偏左下前端 (-0.19, -0.005)，尾焰沿 +x 向右上方大幅展开（总跨度扩大约 1.45 倍）
    vec2 cometPos = mp - vec2(-0.19, -0.005);
    float x = cometPos.x;
    float y = cometPos.y;

    vec3 finalColor = vec3(0.0);

    // =========================================================================
    // 1. 彗星实时流变块状虹彩尾焰（流线型纺锤 V 字包络 ~3.4:1 + 7-Tap CC Radial Blur + Camera Lens Blur 柔焦消散）
    // =========================================================================
    if (x > -0.016 && x < 0.80) {
      float tx = max(x, 0.0005);

      // Wave Warp + Displacement Map：克制的高速流线微幅波动，保持空气动力学笔直破空感
      float wave = sin(tx * 7.8 - uTime * 5.8) * 0.0045 * smoothstep(0.01, 0.35, tx);
      float disp = snoise(vec2(tx * 2.2 - uTime * 2.5, y * 2.6)) * 0.0060 * smoothstep(0.02, 0.42, tx);
      float wy = y + wave + disp;

      // 流线型纺锤 V 字包络（还原 final_crop_01 / 03 / 09 特征）：
      // 头部以 ~32° 利落 V 字展开，在中段转为平缓流线弧面并向尾端柔和聚拢，兼具锐利破空头与修长流线尾
      float coneWidth = 0.010 + 0.275 * pow(tx, 0.74) * exp(-tx * 1.12);
      float ny = wy / coneWidth;
      float absNy = abs(ny);

      if (absNy < 1.32) {
        // 7-Tap 渐进式 CC Radial Blur（前段保留清晰虹彩色块阶梯，中后段沿飞行轴线拉出柔和画笔刷丝羽流）
        float accumColorEnergy = 0.0;
        float accumPlumeFade = 0.0;
        float accumHueWave = 0.0;
        float accumWing = 0.0;
        float accumPacket = 0.0;
        float weightSum = 0.0;
        float radialStep = mix(0.022, 0.064, smoothstep(0.08, 0.50, tx));

        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float radialScale = max(1.0 - fi * radialStep, 0.08);
          float sampleTx = max(tx * radialScale, 0.0005);
          float sampleNy = ny * (1.0 - fi * 0.010);
          float w = exp(-fi * 0.26);

          float ce, pf, hw, wh, ph;
          samplePlasmaField(sampleTx, sampleNy, uTime, ce, pf, hw, wh, ph);
          accumColorEnergy += ce * w;
          accumPlumeFade += pf * w;
          accumHueWave += hw * w;
          accumWing += wh * w;
          accumPacket += ph * w;
          weightSum += w;
        }

        float colorEnergy = accumColorEnergy / weightSum;
        float plumeFade = accumPlumeFade / weightSum;
        float hueWave = accumHueWave / weightSum;
        float wingHighlight = accumWing / weightSum;
        float packetHighlight = accumPacket / weightSum;

        // 横向截面羽化包络：前段以两侧 V 字激波翼为清晰边界，中后段模拟 Camera Lens Blur 增大边缘羽化宽度并向内收拢
        float dynamicEdgeLimit = mix(1.02, 0.78, smoothstep(0.24, 0.68, tx));
        float edgeFeatherWidth = mix(0.14, 0.34, smoothstep(0.18, 0.58, tx));
        float lateralFade = smoothstep(
          dynamicEdgeLimit + edgeFeatherWidth,
          dynamicEdgeLimit - edgeFeatherWidth,
          absNy
        );

        // 纵向与羽流柔和衰减：前段色块干脆，中后段平滑过渡为柔焦光雾消散于纯黑背景
        float crispFrontMask = smoothstep(0.12, 0.32, plumeFade);
        float softTailMask = pow(clamp(plumeFade * 1.15, 0.0, 1.0), 1.25);
        float plumeAlpha = mix(crispFrontMask, softTailMask, smoothstep(0.12, 0.34, tx)) *
                           lateralFade *
                           smoothstep(-0.010, 0.010, x) *
                           smoothstep(0.74, 0.22, tx);

        // 计算多层高饱和虹彩色块颜色
        vec3 blockColor = iridescentColorBlocks(
          colorEnergy,
          tx,
          ny,
          hueWave,
          wingHighlight,
          packetHighlight,
          uTime
        );

        // 星核后方紧邻的「冰天青 + 薄荷翠绿」扇形折光内芯（集中在前 15% 长度内，还原参考片星核正后方鲜亮的青蓝/翠绿区）
        float noseCyanMask = exp(-tx * 14.0) * exp(-pow((ny - 0.04 * sin(uTime * 1.8)) / 0.62, 2.0));
        vec3 cyanMintCol = mix(
          vec3(0.42, 0.90, 1.00),
          vec3(0.28, 0.98, 0.72),
          smoothstep(-0.25, 0.45, ny + 0.16 * hueWave)
        );
        blockColor = mix(blockColor, cyanMintCol, clamp(noseCyanMask * 0.78, 0.0, 0.85));

        // 星核根部纯白无缝衔接
        float rootWhite = exp(-tx * 32.0) * exp(-pow(ny / 0.42, 2.0));
        blockColor = mix(blockColor, vec3(1.0, 0.99, 1.0), clamp(rootWhite, 0.0, 1.0));

        finalColor += blockColor * plumeAlpha * (0.96 + 0.22 * smoothstep(0.35, 0.85, colorEnergy));
      }
    }

    // =========================================================================
    // 2. 伴飞破空纤细速度线（还原 Final 面板四周平行斜向掠过的纤细流光速度线）
    // =========================================================================
    {
      vec2 speedUv = vec2(mp.x * 1.35 - uTime * 3.8, mp.y * 30.0);
      float lineId = floor(speedUv.y);
      float lineFract = fract(speedUv.y) - 0.5;
      float lineHash = fract(sin(lineId * 127.1 + 311.7) * 43758.5453);

      if (lineHash > 0.68) {
        float speedPhase = speedUv.x * (0.85 + lineHash * 0.85) + lineHash * 19.0;
        float segment = smoothstep(0.82, 0.992, sin(speedPhase));
        float lineThickness = exp(-abs(lineFract) * 16.0);
        float fieldMask = exp(-length((mp - vec2(0.08, 0.0)) * vec2(1.35, 2.4)) * 2.3);
        vec3 lineCol = mix(
          vec3(0.38, 0.58, 0.98),
          mix(vec3(0.30, 0.95, 0.68), vec3(0.96, 0.88, 0.50), step(0.82, lineHash)),
          lineHash
        );
        finalColor += lineCol * segment * lineThickness * fieldMask * 0.55;
      }
    }

    // =========================================================================
    // 3. 放大后的饱满锐利四角星核（紧贴星芒几何轮廓，无外溢光泡）
    // =========================================================================
    {
      float starRot = -0.28 + sin(uTime * 2.4) * 0.045;
      float starScale = 0.105 * (1.0 + sin(uTime * 7.5) * 0.038);
      float coreBody, starHalo;
      fourPointStar(cometPos, starRot, starScale, coreBody, starHalo);

      // 仅沿四角星自身凹四边形边缘产生极紧凑柔和包边
      vec3 haloCol = mix(vec3(0.76, 0.24, 0.94), vec3(0.42, 0.88, 1.0), smoothstep(-0.02, 0.04, cometPos.x));
      finalColor += haloCol * starHalo * 0.32;

      // 高纯度亮白四角星本体
      vec3 starCol = mix(vec3(0.94, 0.76, 1.0), vec3(1.0, 0.995, 1.0), smoothstep(0.12, 0.48, coreBody));
      finalColor = mix(finalColor, starCol, clamp(coreBody * 1.15, 0.0, 1.0));
    }

    // 柔和截断极暗噪底，保证四周背景纯粹 #000000 黑底且保留伴飞速度线
    finalColor *= smoothstep(0.005, 0.022, max(finalColor.r, max(finalColor.g, finalColor.b)));

    // =========================================================================
    // 4. 头盔面罩四角物理光学色散光晕（仅在角落出现少量彩虹色散衍射环，并随鼠标视角实时变化）
    // =========================================================================
    if (uHelmetMode > 0.5) {
      vec2 starWorldOffset = rot2d(-tailAngle) * vec2(-0.19, -0.005) * meteorScale;
      vec2 starScreenPos = heroCenter + starWorldOffset;
      finalColor += cornerChromaticLensFlare(
        p,
        uv,
        starScreenPos,
        uMouse,
        uTime,
        uFlareIntensity,
        uFlareVignetteStart
      );
    }

    // 应用整个画面的饱和度调校（默认 1.25 保持饱满霓虹宝石色，可在左上角调校面板实时调节）
    finalColor = applySceneSaturation(finalColor, uSaturation);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

function MeteorShaderPlane({
  onReady,
  headPoseRef,
  hudSettings,
}: MeteorHeroCanvasProps) {
  const matRef = useRef<ShaderMaterial>(null);
  const { size, gl } = useThree();
  const mouseTarget = useRef(new Vector2(0, 0));
  const mouseCurrent = useRef(new Vector2(0, 0));
  const frameCount = useRef(0);
  const reported = useRef(false);

  useEffect(() => {
    configurePostProcessingRenderer(gl);
  }, [gl]);

  useEffect(() => {
    if (headPoseRef) return;
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      mouseTarget.current.set(nx, ny);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [headPoseRef]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new Vector2(size.width, size.height) },
      uMouse: { value: new Vector2(0, 0) },
      uSlowMouse: { value: new Vector2(0, 0) },
      uHelmetMode: { value: headPoseRef ? 1.0 : 0.0 },
      uSaturation: {
        value:
          hudSettings?.sceneSaturation ??
          DEFAULT_HELMET_HUD_SETTINGS.sceneSaturation,
      },
      uFlareIntensity: {
        value:
          hudSettings?.flareIntensity ??
          DEFAULT_HELMET_HUD_SETTINGS.flareIntensity,
      },
      uFlareVignetteStart: {
        value:
          hudSettings?.flareVignetteStart ??
          DEFAULT_HELMET_HUD_SETTINGS.flareVignetteStart,
      },
      uBaseColor: { value: new Color("#000000") },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame(({ clock }) => {
    if (!reported.current && onReady) {
      frameCount.current += 1;
      if (frameCount.current >= 2) {
        reported.current = true;
        onReady();
      }
    }

    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    matRef.current.uniforms.uResolution.value.set(size.width, size.height);
    matRef.current.uniforms.uHelmetMode.value = headPoseRef ? 1.0 : 0.0;
    matRef.current.uniforms.uSaturation.value =
      hudSettings?.sceneSaturation ??
      DEFAULT_HELMET_HUD_SETTINGS.sceneSaturation;
    matRef.current.uniforms.uFlareIntensity.value =
      hudSettings?.flareIntensity ??
      DEFAULT_HELMET_HUD_SETTINGS.flareIntensity;
    matRef.current.uniforms.uFlareVignetteStart.value =
      hudSettings?.flareVignetteStart ??
      DEFAULT_HELMET_HUD_SETTINGS.flareVignetteStart;

    if (headPoseRef?.current) {
      matRef.current.uniforms.uMouse.value.set(
        headPoseRef.current.fastX,
        headPoseRef.current.fastY
      );
      matRef.current.uniforms.uSlowMouse.value.set(
        headPoseRef.current.slowX,
        headPoseRef.current.slowY
      );
    } else {
      mouseCurrent.current.x = MathUtils.lerp(
        mouseCurrent.current.x,
        mouseTarget.current.x,
        0.06
      );
      mouseCurrent.current.y = MathUtils.lerp(
        mouseCurrent.current.y,
        mouseTarget.current.y,
        0.06
      );
      matRef.current.uniforms.uMouse.value.copy(mouseCurrent.current);
      matRef.current.uniforms.uSlowMouse.value.copy(mouseCurrent.current);
    }
  });

  return (
    <mesh position={[0, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export function MeteorHeroCanvas({
  onReady,
  headPoseRef,
  hudSettings,
}: MeteorHeroCanvasProps) {
  const [renderMode, setRenderMode] = useState<"full" | "basic" | "static">("full");

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
    });
  }, []);

  const handleCanvasError = useCallback((error: Error) => {
    console.warn("[login-meteor] WebGL failed, falling back:", error);
    setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
  }, []);

  if (renderMode === "static") {
    return <StaticMeteorFallback onReady={onReady} />;
  }

  return (
    <MeteorErrorBoundary
      key={renderMode}
      fallback={<StaticMeteorFallback onReady={onReady} />}
      onError={handleCanvasError}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 100 }}
        dpr={renderMode === "basic" ? 1 : [1, 1.75]}
        resize={{ offsetSize: true }}
        gl={{
          antialias: renderMode === "full",
          alpha: false,
          powerPreference: renderMode === "full" ? "high-performance" : "default",
        }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ width: "100%", height: "100%", display: "block", background: "#000000" }}
        onCreated={handleCreated}
      >
        <color attach="background" args={["#000000"]} />
        <MeteorShaderPlane
          onReady={onReady}
          headPoseRef={headPoseRef}
          hudSettings={hudSettings}
        />
        {renderMode === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom
              intensity={0.42}
              luminanceThreshold={0.92}
              luminanceSmoothing={0.25}
              radius={0.42}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </MeteorErrorBoundary>
  );
}
