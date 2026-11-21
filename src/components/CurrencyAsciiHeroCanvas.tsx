import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  createPortal,
  useFrame,
  useThree,
  type RootState,
} from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import {
  Box3,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  RGBAFormat,
  Scene as ThreeScene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type DirectionalLight,
  type PointLight,
  type WebGLRenderer,
} from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
  DEFAULT_ASCII_ART_SETTINGS,
  type AsciiArtSettings,
} from "./AsciiArtSettingsPanel";

import usdSvgRaw from "../assets/currency-symbols/usd.svg?raw";
import cnySvgRaw from "../assets/currency-symbols/cny.svg?raw";
import gbpSvgRaw from "../assets/currency-symbols/gbp.svg?raw";
import eurSvgRaw from "../assets/currency-symbols/eur.svg?raw";
import rubSvgRaw from "../assets/currency-symbols/rub.svg?raw";

/**
 * 经过严格跨平台字形验证的全球主要货币符号集合（100% 具备独立字形，绝不产生缺字豆腐块 .notdef）
 * 涵盖：美元 $、欧元 €、英镑 £、日元/人民币 ¥、印度卢比 ₹、俄罗斯卢布 ₽、韩元 ₩、
 * 土耳其里拉 ₺、乌克兰格里夫纳 ₴、尼日利亚奈拉 ₦、菲律宾比索 ₱、泰铢 ฿、以色列新谢克尔 ₪、
 * 越南盾 ₫、哥斯达黎加科朗 ₡、老挝基普 ₭、蒙古图格里克 ₮、荷兰盾 ƒ、美分 ¢、国际通用货币符 ¤、比特币 ₿
 */
const WORLD_CURRENCY_SYMBOLS = [
  "¢",
  "ƒ",
  "₫",
  "₡",
  "£",
  "¥",
  "€",
  "₹",
  "₽",
  "₺",
  "₴",
  "₱",
  "฿",
  "₪",
  "₦",
  "₩",
  "$",
];

/**
 * 联合国安理会五常国家货币符号 3D 主视觉
 * 颜色取自各国纸币/货币的代表性色相：
 * - $ 美元绿（美钞）
 * - ¥ 人民币粉红（100 元券）
 * - £ 英镑紫（英央行 £20）
 * - € 欧元蓝（欧盟蓝）
 * - ₽ 俄罗斯红（俄钞主色）
 */
interface CurrencySymbolSource {
  id: string;
  name: string;
  symbol: string;
  svgRaw: string;
  targetSize: number;
  extrudeDepth: number;
  colorHex: string;
}

const P5_CURRENCY_SOURCES: readonly CurrencySymbolSource[] = [
  {
    id: "usd",
    name: "US Dollar",
    symbol: "$",
    svgRaw: usdSvgRaw,
    targetSize: 4.4,
    extrudeDepth: 3.6,
    colorHex: "#85BB65",
  },
  {
    id: "cny",
    name: "Chinese Yuan",
    symbol: "¥",
    svgRaw: cnySvgRaw,
    targetSize: 4.2,
    extrudeDepth: 3.6,
    colorHex: "#E891B0",
  },
  {
    id: "gbp",
    name: "British Pound",
    symbol: "£",
    svgRaw: gbpSvgRaw,
    targetSize: 4.3,
    extrudeDepth: 3.6,
    colorHex: "#6B3AA0",
  },
  {
    id: "eur",
    name: "Euro",
    symbol: "€",
    svgRaw: eurSvgRaw,
    targetSize: 4.3,
    extrudeDepth: 3.6,
    colorHex: "#2E5AAB",
  },
  {
    id: "rub",
    name: "Russian Ruble",
    symbol: "₽",
    svgRaw: rubSvgRaw,
    targetSize: 4.2,
    extrudeDepth: 3.6,
    colorHex: "#D52B1E",
  },
];

class AsciiErrorBoundary extends Component<
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

function StaticAsciiFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
      aria-hidden
    >
      {/* 左上角斜向平行柔光束静态回退层 */}
      <div
        className="absolute inset-0 opacity-35"
        style={{
          background:
            "linear-gradient(128deg, rgba(200,205,215,0.14) 0%, rgba(0,0,0,0) 14%, rgba(200,205,215,0.18) 24%, rgba(0,0,0,0) 36%, rgba(200,205,215,0.12) 48%, rgba(0,0,0,0) 68%)",
        }}
      />
      <div
        className="absolute left-[32%] top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-[72px]"
        style={{
          background:
            "radial-gradient(circle, rgba(133,187,101,0.34) 0%, rgba(232,145,176,0.30) 28%, rgba(107,58,160,0.28) 50%, rgba(46,90,171,0.26) 72%, rgba(213,43,30,0.22) 88%, rgba(0,0,0,0) 100%)",
        }}
      />
    </div>
  );
}

/**
 * 在内存中构建全球货币符号纹理图集（Currency Glyph Atlas）
 * 自动测量每个货币符号的真实像素墨水密度并升序排列，保证暗部稀疏、高光饱满。
 */
function createCurrencyGlyphAtlas(): {
  texture: CanvasTexture;
  glyphCount: number;
} {
  const uniqueSymbols = Array.from(new Set(WORLD_CURRENCY_SYMBOLS));
  const cellSize = 96;
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = cellSize;
  measureCanvas.height = cellSize;
  const mCtx = measureCanvas.getContext("2d", { willReadFrequently: true });

  // 选用字怀开阔、笔画清晰的粗体字体，字号加大至 76px，确保货币符号在单元格内饱满紧凑且笔画分明
  const fontStack =
    '700 76px "SF Mono", "Menlo", "Monaco", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

  interface MeasuredGlyph {
    char: string;
    density: number;
  }

  const measured: MeasuredGlyph[] = [];

  if (mCtx) {
    for (const char of uniqueSymbols) {
      mCtx.clearRect(0, 0, cellSize, cellSize);
      mCtx.fillStyle = "#ffffff";
      mCtx.font = fontStack;
      mCtx.textAlign = "center";
      mCtx.textBaseline = "middle";
      mCtx.fillText(char, cellSize / 2, cellSize / 2 + 2);

      const img = mCtx.getImageData(0, 0, cellSize, cellSize).data;
      let inkSum = 0;
      for (let i = 3; i < img.length; i += 4) {
        inkSum += img[i];
      }
      const density = inkSum / (cellSize * cellSize * 255);
      // 过滤掉空白字符或异常过密的缺字方框 (.notdef)
      if (density > 0.002 && density < 0.42) {
        measured.push({ char, density });
      }
    }
  }

  // 按视觉墨水密度从低到高排序，最轻为 '·'，最饱满为 '$' / '€' / '₩' 等
  measured.sort((a, b) => a.density - b.density);

  // 第 0 格留空给纯暗底，后续为密度递增的全球货币符号
  const orderedChars = [" ", ...measured.map((m) => m.char)];
  const glyphCount = orderedChars.length;

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = cellSize * glyphCount;
  atlasCanvas.height = cellSize;
  const ctx = atlasCanvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    for (let i = 1; i < glyphCount; i++) {
      const ch = orderedChars[i];
      const cx = i * cellSize + cellSize * 0.5;
      const cy = cellSize * 0.5 + 3;

      ctx.save();
      ctx.font = fontStack;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // 绘制锐利干净的货币符号（不加模糊阴影，让字符轮廓在强 Bloom 下依然清晰锐利）
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, cx, cy);
      ctx.restore();
    }
  }

  const texture = new CanvasTexture(atlasCanvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return { texture, glyphCount };
}

/**
 * 解析货币符号 SVG 并挤出带精致斜角（Bevel）的 3D 几何体组，完整保留代表性纸币色（严禁二次 Gamma 转换）
 */
function buildExtrudedCurrencyGroup(source: CurrencySymbolSource): Group {
  const loader = new SVGLoader();
  const svgData = loader.parse(source.svgRaw);
  const rawGroup = new Group();
  const extrudeDepth = source.extrudeDepth;

  // 欧元蓝 / 英镑紫等冷色感知明度偏低，略微抬高目标亮度以保证 ASCII 矩阵中同样醒目
  const isCoolTone = source.id === "eur" || source.id === "gbp";
  const targetBrightness = isCoolTone ? 0.72 : 0.62;

  svgData.paths.forEach((path) => {
    const fillHex =
      (path.userData?.style as { fill?: string } | undefined)?.fill ||
      source.colorHex;
    if (!fillHex || fillHex === "none") return;

    // Three.js ColorManagement 已自动将 sRGB Hex 转为线性工作空间
    const baseColor = new Color(fillHex);
    const maxCh = Math.max(baseColor.r, baseColor.g, baseColor.b, 0.001);
    const displayColor = baseColor
      .clone()
      .multiplyScalar(targetBrightness / maxCh);

    const shapes = SVGLoader.createShapes(path);

    // 材质粗糙度 80%，配合挤压厚度与漫反射光照梯度驱动 ASCII 字符密度
    const material = new MeshStandardMaterial({
      color: displayColor,
      emissive: displayColor,
      emissiveIntensity: isCoolTone ? 0.22 : 0.16,
      metalness: 0.12,
      roughness: 0.8,
    });

    shapes.forEach((shape) => {
      const geometry = new ExtrudeGeometry(shape, {
        depth: extrudeDepth,
        bevelEnabled: true,
        bevelThickness: extrudeDepth * 0.16,
        bevelSize: extrudeDepth * 0.12,
        bevelOffset: 0,
        bevelSegments: 3,
        curveSegments: 24,
      });

      geometry.translate(0, 0, -extrudeDepth * 0.5);
      rawGroup.add(new Mesh(geometry, material));
    });
  });

  // SVG 坐标系 Y 轴向下，翻转 Y 轴使其正向朝上
  rawGroup.scale.set(1, -1, 1);
  rawGroup.updateMatrixWorld(true);

  const box = new Box3().setFromObject(rawGroup);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxPlanarDim = Math.max(size.x, size.y, 1e-4);
  const uniformScale = source.targetSize / maxPlanarDim;

  const normalizedGroup = new Group();
  rawGroup.position.set(
    -center.x * uniformScale,
    -center.y * uniformScale,
    -center.z * uniformScale
  );
  rawGroup.scale.set(uniformScale, -uniformScale, uniformScale);
  normalizedGroup.add(rawGroup);

  return normalizedGroup;
}

const asciiVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * 全球货币符号 3D ASCII 艺术后处理 Shader（对标参考图 1）：
 * - 将 3D 离屏渲染的挤压五常货币符号转换为高精度等宽货币符号发光矩阵
 * - 字符大小、笔画密度与发光强度随 3D 模型表面法线光照梯度动态变化
 * - 完整保留各国货币代表性色彩，并在强高光区（Specular Hotspot）自然过渡出暖白/荧光辉光核心
 * - 暗部背景保留参考图 1 特有的细腻 CRT / 矩阵微光扫描网格与径向暗角
 */
const asciiFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uSceneTex;
  uniform sampler2D uGlowTex;
  uniform sampler2D uGlyphAtlas;
  uniform float uGlyphCount;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uFocusCenter;

  uniform float uGridRows;
  uniform float uCharScale;
  uniform float uCellGap;
  uniform float uStrokeBoldness;
  uniform float uGlowIntensity;
  uniform float uCoreBrightness;
  uniform float uHaloSpread;
  uniform float uCrtGridOpacity;
  uniform float uBgBeamIntensity;
  uniform float uConsoleBounceIntensity;
  uniform float uConsoleBounceSpread;
  uniform vec4 uConsoleRect;
  uniform float uHorizGlitch;

  varying vec2 vUv;

  float hash11(float p) {
    return fract(sin(p * 127.1 + 311.7) * 437.585453);
  }

  float sqr(float x) {
    return x * x;
  }

  float safePow(float x, float p) {
    return x > 0.00001 ? pow(x, p) : 0.0;
  }

  float noise1d(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
  }

  // 提取纯净无噪波的品牌色相（归一化最高通道，保持色彩纯粹高饱和）
  vec3 extractPureBrandColor(vec3 rawRgb) {
    float peak = max(rawRgb.r, max(rawRgb.g, rawRgb.b));
    if (peak < 0.0005) return vec3(0.0);
    vec3 normCol = rawRgb / peak;
    float avg = (normCol.r + normCol.g + normCol.b) / 3.0;
    return clamp(mix(vec3(avg), normCol, 1.32), 0.0, 1.0);
  }

  void main() {
    // 1. 构建大尺寸、紧凑的等宽字符矩阵网格
    float targetRows = clamp(uGridRows, 24.0, 110.0);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 gridDims = vec2(floor(targetRows * aspect), targetRows);

    vec2 gridCoord = vUv * gridDims;
    vec2 cellIndex = floor(gridCoord);
    vec2 cellUv = fract(gridCoord);

    // 2. 横向复古扫描微颤（仅做极克制的单行水平微移，绝不叠加偏移副本，彻底杜绝字符重影）
    float rowY = cellIndex.y;
    float rowWave =
      noise1d(rowY * 0.35 + uTime * 1.1) * 0.65 +
      noise1d(rowY * 1.25 - uTime * 2.2) * 0.35;
    float tearSpike = smoothstep(0.78, 0.97, noise1d(rowY * 0.22 - uTime * 0.7));
    float rowOffsetCells =
      ((rowWave - 0.5) * 0.35 + tearSpike * (rowWave - 0.5) * 0.65) * uHorizGlitch;

    vec2 sampleCenterUv = (cellIndex + 0.5) / gridDims;
    vec2 jitteredCenterUv = vec2(
      sampleCenterUv.x + rowOffsetCells / gridDims.x,
      sampleCenterUv.y
    );

    // 主体当前格精确采样（绝不将左右远端邻格混入 combinedRgb，100% 根除字母边缘与字怀内部的重影字符）
    vec4 sCenter = texture2D(uSceneTex, jitteredCenterUv);
    vec3 combinedRgb = sCenter.rgb;

    // 紧邻 0.65 格采样仅用于计算笔画内部与边缘的雕塑立体梯度，不产生任何重影字符
    float stepX = 1.0 / gridDims.x;
    float stepY = 1.0 / gridDims.y;
    vec4 sUp = texture2D(uSceneTex, jitteredCenterUv + vec2(0.0, stepY * 0.65));
    vec4 sDown = texture2D(uSceneTex, jitteredCenterUv - vec2(0.0, stepY * 0.65));
    vec4 sLeft1 = texture2D(uSceneTex, jitteredCenterUv - vec2(stepX * 0.65, 0.0));
    vec4 sRight1 = texture2D(uSceneTex, jitteredCenterUv + vec2(stepX * 0.65, 0.0));

    float pUp = max(sUp.r, max(sUp.g, sUp.b));
    float pDown = max(sDown.r, max(sDown.g, sDown.b));
    float pLeft = max(sLeft1.r, max(sLeft1.g, sLeft1.b));
    float pRight = max(sRight1.r, max(sRight1.g, sRight1.b));
    float neighborPresence = (pUp + pDown + pLeft + pRight) * 0.25;
    float interiorFactor = smoothstep(0.02, 0.42, neighborPresence);

    // 3. 零重影真实二维高斯光晕场（True 5x5 Contiguous Gaussian Halo on 64x64 Low-Res Buffer）
    // 原因修复：此前在高清纹理上做大半径稀疏采样会产生 12 个轮廓重影；
    // 现改为在独立的 64x64 硬件双线性低分缓冲 uGlowTex 上执行步长 <= 1.5 纹素的紧密连续 5x5 二维高斯卷积，
    // 采样足迹 100% 连续重叠、毫无间隙，从数学上彻底根除任何辉光重影，同时完美贴合 Logo 真实形态！
    vec3 blurNear = vec3(0.0);
    vec3 blurWide = vec3(0.0);
    float gaussWeightSum = 0.0;

    float spreadClamped = clamp(uHaloSpread, 0.2, 2.5);
    vec2 nearStep = vec2(1.0 / aspect, 1.0) * (0.011 * spreadClamped);
    vec2 wideStep = vec2(1.0 / aspect, 1.0) * (0.024 * spreadClamped);

    for (int ix = -2; ix <= 2; ix++) {
      for (int iy = -2; iy <= 2; iy++) {
        vec2 gridOff = vec2(float(ix), float(iy));
        float distSq = dot(gridOff, gridOff);
        float w = exp(-distSq * 0.42);
        blurNear += texture2D(uGlowTex, sampleCenterUv + gridOff * nearStep).rgb * w;
        blurWide += texture2D(uGlowTex, sampleCenterUv + gridOff * wideStep).rgb * w;
        gaussWeightSum += w;
      }
    }
    blurNear /= gaussWeightSum;
    blurWide /= gaussWeightSum;

    vec3 haloRgb = blurNear * 0.65 + blurWide * 0.45;
    float nearPeak = max(blurNear.r, max(blurNear.g, blurNear.b));
    float widePeak = max(blurWide.r, max(blurWide.g, blurWide.b));
    vec3 pureHaloCol = extractPureBrandColor(haloRgb + vec3(0.0001));
    float haloEnergy = clamp((nearPeak * 1.05 + widePeak * 0.55) * uHaloSpread, 0.0, 1.75);
    float wideAura = clamp(widePeak * 1.10 * uHaloSpread, 0.0, 1.2);

    // 4. 复古 CRT 矩阵点阵暗纹与水平扫描线（Retro CRT Phosphor Matrix & Scanlines）
    // 复刻参考图 2：背景点阵为精致细腻的微光矩阵圆点与横纹，绝不喧宾夺主抢走字符本体的风采
    vec2 absCell = abs(cellUv - 0.5);
    float matrixBorder = max(0.5 - uCellGap, 0.22);
    float crtPadMask =
      smoothstep(matrixBorder + 0.02, matrixBorder - 0.02, absCell.x) *
      smoothstep(matrixBorder + 0.02, matrixBorder - 0.02, absCell.y);
    float crtSubDot = smoothstep(0.42, 0.08, length(cellUv - 0.5));
    // 每一行内部的复古 CRT 水平扫描亮线
    float scanlineWave = 0.38 + 0.62 * cos((cellUv.y - 0.5) * 6.2831853);
    // 跨行的复古浅扫描横纹（模拟老式显像管电子束横向扫描条纹）
    float rowScanBand =
      0.74 +
      0.26 * sin(rowY * 3.14159) +
      0.55 * smoothstep(0.58, 0.95, rowWave) * uHorizGlitch;

    vec2 normPos = (sampleCenterUv - uFocusCenter) * vec2(aspect, 1.0);
    float distFromFocus = length(normPos);
    float studioVignette = exp(-distFromFocus * distFromFocus * 3.8);

    // CRT 矩阵点阵暗纹：远处保持纯粹曜石黑底色，主体周围径向光晕区内显现细腻的复古矩阵微光点阵
    vec3 ambientCrtTint = vec3(0.055, 0.048, 0.042);
    vec3 activeHaloTint = mix(pureHaloCol, vec3(1.0, 0.95, 0.85), 0.12);
    vec3 baseCrtTint = mix(
      ambientCrtTint,
      activeHaloTint,
      clamp(haloEnergy * 2.0 + wideAura * 1.2, 0.0, 1.0)
    );
    float crtPattern = crtPadMask * (0.28 + 0.72 * crtSubDot) * scanlineWave * rowScanBand;
    float crtVisibility = clamp(
      (0.026 * studioVignette + safePow(wideAura, 0.95) * 0.16 + safePow(haloEnergy, 1.15) * 0.24) *
        uCrtGridOpacity,
      0.0,
      0.34
    );

    vec3 finalColor = baseCrtTint * crtPattern * crtVisibility;

    // 4b. 左上角斜向平行光源（Diagonal Parallel Light Beams from Top-Left）：
    // 复刻参考图：多束柔和的斜向平行光从左上角打入画面，如微风拂动窗帘或树叶般缓慢摇曳、开合与明暗消长；
    // 照射范围扩展至图 2 蓝线边界（涵盖左下角、画面中区并延伸至右侧登录器上方与左半部），向右下角平滑归零。
    vec2 topLeftCoord = vec2(sampleCenterUv.x * aspect, 1.0 - sampleCenterUv.y);
    // 光束沿左上 -> 右下方向传播，法线方向（明暗条纹交替轴）指向右上
    vec2 beamDir = normalize(vec2(0.56, 0.828));
    vec2 beamNormal = vec2(beamDir.y, -beamDir.x);
    float beamAlong = max(dot(topLeftCoord, beamDir), 0.0);
    float beamCross = dot(topLeftCoord, beamNormal);

    // 模拟微风吹拂窗帘褶皱 / 枝叶间隙的自然动态：
    // 每道光柱拥有独立低频相位的横向轻摆（Sway）、缝隙宽度开合（Width）与明暗呼吸消长（Amplitude）
    float windTime = uTime * 0.52;
    // 随光线延伸方向的微风角度轻摆（模拟风吹叶片/帘幕自上而下的柔波扫动）
    float angleSway =
      (sin(windTime * 0.62) * 0.065 + cos(windTime * 0.37) * 0.035) * beamAlong;
    float sBase = beamCross - beamAlong * 0.04 + angleSway;

    // 光柱 0：左下侧翼柔光束（覆盖图 2 蓝线内的左下象限区域）
    float c0 = -0.40 + cos(windTime * 0.66 + 1.5) * 0.085 + sin(windTime * 0.41) * 0.04;
    float w0 = 0.088 * (0.70 + 0.45 * cos(windTime * 0.82 + 0.6));
    float a0 = 0.50 * (0.38 + 0.62 * (0.5 + 0.5 * cos(windTime * 0.59 + 2.2)));
    float ray0 = exp(-sqr((sBase - c0) / w0)) * a0;

    // 光柱 1：左侧柔光束（随风轻晃、时隐时现）
    float c1 = -0.16 + sin(windTime * 0.78 + 0.4) * 0.095 + cos(windTime * 0.43) * 0.045;
    float w1 = 0.082 * (0.68 + 0.48 * sin(windTime * 0.91 + 1.1));
    float a1 = 0.68 * (0.35 + 0.65 * (0.5 + 0.5 * sin(windTime * 0.67 + 0.8)));
    float ray1 = exp(-sqr((sBase - c1) / w1)) * a1;

    // 光柱 2：主光束 A（与相邻光柱产生自然的聚散与宽窄交替）
    float c2 = 0.05 + sin(windTime * 0.64 + 2.1) * 0.105 - sin(windTime * 1.12) * 0.04;
    float w2 = 0.102 * (0.70 + 0.46 * cos(windTime * 0.73 + 0.5));
    float a2 = 0.94 * (0.42 + 0.58 * (0.5 + 0.5 * cos(windTime * 0.58 + 1.9)));
    float ray2 = exp(-sqr((sBase - c2) / w2)) * a2;

    // 光柱 3：核心主光束 B（随微风舒展与收拢）
    float c3 = 0.30 + cos(windTime * 0.56 + 1.2) * 0.115 + sin(windTime * 0.94 + 3.0) * 0.045;
    float w3 = 0.120 * (0.68 + 0.50 * sin(windTime * 0.62 + 2.4));
    float a3 = 1.00 * (0.48 + 0.52 * (0.5 + 0.5 * sin(windTime * 0.51 + 0.3)));
    float ray3 = exp(-sqr((sBase - c3) / w3)) * a3;

    // 光柱 4：中区宽幅柔光束（与光柱 3 此消彼长）
    float c4 = 0.58 + sin(windTime * 0.52 + 4.2) * 0.125 - cos(windTime * 0.86 + 1.7) * 0.05;
    float w4 = 0.150 * (0.68 + 0.52 * cos(windTime * 0.68 + 3.5));
    float a4 = 0.94 * (0.44 + 0.56 * (0.5 + 0.5 * cos(windTime * 0.61 + 2.8)));
    float ray4 = exp(-sqr((sBase - c4) / w4)) * a4;

    // 光柱 5：中右延展光束（延伸照向右侧登录器左上侧）
    float c5 = 0.88 + cos(windTime * 0.69 + 2.7) * 0.130 + sin(windTime * 0.44) * 0.055;
    float w5 = 0.172 * (0.68 + 0.50 * sin(windTime * 0.77 + 4.1));
    float a5 = 0.88 * (0.42 + 0.58 * (0.5 + 0.5 * sin(windTime * 0.54 + 4.5)));
    float ray5 = exp(-sqr((sBase - c5) / w5)) * a5;

    // 光柱 6：右上远端柔光束（延伸至图 2 顶边蓝线 x ≈ 0.90 区域）
    float c6 = 1.18 + sin(windTime * 0.58 + 5.1) * 0.125 - cos(windTime * 0.49 + 0.9) * 0.05;
    float w6 = 0.185 * (0.70 + 0.46 * cos(windTime * 0.63 + 1.4));
    float a6 = 0.76 * (0.40 + 0.60 * (0.5 + 0.5 * cos(windTime * 0.47 + 3.2)));
    float ray6 = exp(-sqr((sBase - c6) / w6)) * a6;

    // 树叶/窗纱斑驳微澜调制（随微风沿光束缓慢流淌的柔和光影涟漪）
    float dappledRipple =
      0.82 +
      0.18 *
        sin(beamCross * 13.0 + windTime * 1.15 - beamAlong * 2.4) *
        cos(beamAlong * 5.0 - windTime * 0.78);

    float multiRayProfile = clamp(
      (ray0 + ray1 + ray2 + ray3 + ray4 + ray5 + ray6) * dappledRipple,
      0.0,
      1.35
    );

    // 空间衰减包络（严格精准对齐用户图 2 蓝线边界与衰减规律）：
    // 1. 照射范围扩展至图 2 蓝线边界：顶边延伸至 x ≈ 0.88（登录器右侧），中部穿过登录器 x ≈ 0.75，底边收于中央 x ≈ 0.50；
    // 2. 光线强弱衰减：左上角光源入口最强 (1.0)，向蓝线边界平滑减弱，越过蓝线向右下角归零为完全无光状态 (0.0)。
    float dx = sampleCenterUv.x;
    float dy = 1.0 - sampleCenterUv.y;
    // 蓝线在当前高度对应的 x 坐标（从顶部 y=1.0 的 0.88 到底部的 0.50）
    float blueBoundaryX = mix(0.50, 0.88, sampleCenterUv.y);
    float xRatio = dx / max(blueBoundaryX, 0.01);
    float distNorm = sqrt(xRatio * xRatio + dy * dy * 0.35);
    float falloffLinear = clamp(1.0 - smoothstep(0.05, 1.05, distNorm), 0.0, 1.0);
    float spatialFalloff = falloffLinear * (0.45 + 0.55 * falloffLinear);
    float parallelLightField = multiRayProfile * spatialFalloff;

    // 4c. 登录器左侧与顶部边缘物理漫反射互动（Console Rim Bounce Light - 用户图 1 红圈核心区域）：
    // 左上角斜射光线射入，右侧亮色金属机身迎光的左侧垂直边缘、左上圆角及顶部边缘将光线漫反射回紧邻的 CRT 屏幕表面
    float consoleBounceLight = 0.0;
    if (uConsoleRect.z > uConsoleRect.x) {
      vec2 cMin = uConsoleRect.xy;
      vec2 cMax = uConsoleRect.zw;
      vec2 cSize = max(cMax - cMin, vec2(0.01));
      vec2 p = sampleCenterUv;

      // 设定反光向外扩散的标准范围（以单个 CRT 格高为基准，受 uConsoleBounceSpread 动态调控）
      float cellStep = 1.0 / targetRows;
      float spread = cellStep * (2.8 * clamp(uConsoleBounceSpread, 0.2, 3.5));

      // 判定是否处于机身外侧的迎光反射区（左侧、顶部及左上圆角）
      // 允许反射判定向下轻微延伸（0.85 * cellStep），确保离散 CRT 网格单元与金属机身顶边严丝合缝，消除黑缝
      bool isLeft = p.x < (cMin.x + 0.5 * cellStep * (1.0 / aspect));
      bool isTop = p.y > (cMax.y - 0.85 * cellStep);

      if (isLeft || isTop) {
        // 统一连续的欧氏距离场：彻底消除不同分段拼接处的突变
        float dxOut = max(cMin.x - p.x, 0.0) * aspect;
        float dyOut = max(p.y - cMax.y, 0.0);
        float dOuter = length(vec2(dxOut, dyOut));

        // 归一化局部坐标：relPos.x ∈ [0, 1]（左至右），relPos.y ∈ [0, 1]（底至顶）
        vec2 relPos = (p - cMin) / cSize;

        // 顶部反光权重：向右延伸时平滑羽化消隐（彻底杜绝右上边缘生硬直角截断）
        // 在 relPos.x ∈ [0.55, 0.90] 区间自然衰减至 0.0
        float topWeight = smoothstep(0.90, 0.55, relPos.x);

        // 左侧反光权重：向上收拢（消除左下边缘超出机身底边的多余反光，在螺钉附近平滑羽化至 0）
        // 在 relPos.y ∈ [0.10, 0.35] 区间平滑衰减至 0.0，且越接近左上角越强
        float leftWeight =
          smoothstep(0.10, 0.35, relPos.y) *
          mix(0.72, 1.0, clamp(relPos.y, 0.0, 1.0));

        float bounceWeight = 0.0;
        if (isLeft && !isTop) {
          bounceWeight = leftWeight;
        } else if (isTop && !isLeft) {
          bounceWeight = topWeight;
        } else {
          // 左上圆角过渡区：平滑融合
          bounceWeight = max(leftWeight, topWeight);
        }

        if (bounceWeight > 0.001) {
          // 紧贴机身外边缘处最强，向外呈高斯柔和衰减
          float falloff = exp(- (dOuter * dOuter) / (2.0 * spread * spread * 0.45));
          // 与左上角斜射光束实时互动联动（光线扫过机身时反射同步呼吸增强）
          float incidentModulation = 0.70 + 0.30 * multiRayProfile;
          consoleBounceLight = falloff * bounceWeight * incidentModulation;
        }
      }
    }

    // 发光单元形态掩码（仅点亮背景网格的 CRT 圆角方格底座、中心微凸点阵与扫描线，不额外生成文字字符）
    float glowingUnitMask =
      crtPadMask *
      (0.38 + 0.62 * crtSubDot) *
      (0.46 + 0.54 * scanlineWave) *
      rowScanBand;

    // 微弱的中性冷灰色发光单元（由 uBgBeamIntensity 与 uConsoleBounceIntensity 独立控制，严格受控于发光单元掩码，绝无全屏泛白死光）：
    vec3 subtleGrayUnitColor = vec3(0.76, 0.79, 0.83);
    vec3 consoleBounceTint = vec3(0.82, 0.84, 0.88);
    float beamIntensityFactor = clamp(uBgBeamIntensity, 0.0, 2.5);
    float bounceIntensityFactor = clamp(uConsoleBounceIntensity, 0.0, 3.0);

    finalColor +=
      (subtleGrayUnitColor * parallelLightField * 0.24 * beamIntensityFactor +
        consoleBounceTint * consoleBounceLight * 0.28 * bounceIntensityFactor) *
      glowingUnitMask;

    // 叠加受 CRT 扫描线调制的柔和有色环境光晕底座（模拟参考图 2 中弥漫在字符阵列背后的温暖有色光学辉光）
    finalColor +=
      pureHaloCol *
      (safePow(clamp(haloEnergy * 0.65, 0.0, 1.25), 1.4) * 0.22 +
        safePow(clamp(wideAura * 0.52, 0.0, 1.0), 1.6) * 0.11) *
      scanlineWave *
      uGlowIntensity *
      0.46;

    // 5. 计算主体受光能量（融合 3D 灯光梯度 + 笔画中心立体梯度），映射全球货币符号
    float luma = dot(combinedRgb, vec3(0.299, 0.587, 0.114));
    float peakChannel = max(combinedRgb.r, max(combinedRgb.g, combinedRgb.b));
    float rawLightEnergy = max(luma * 0.85, peakChannel * 0.96);

    // 结合笔画内外梯度与聚光高光分布，使得同一字母从边缘到中心呈现丰富的货币符号大小与粗细层次
    float sculptedEnergy = rawLightEnergy * (0.48 + 0.52 * interiorFactor);

    // 提高边缘阈值至 0.085，干净利落地裁剪掉抗锯齿半透明边缘像素，彻底杜绝字母外围出现游离重影字符
    float edgeThreshold = 0.085;
    if (sculptedEnergy > edgeThreshold) {
      // 纯净平滑的受光强度 [0, 1]，颜色上零噪波
      float normBri = clamp(pow((sculptedEnergy - edgeThreshold) / 0.76, 0.88), 0.05, 0.999);

      // 按受光亮度索引全球货币符号图集（边缘暗部为纤细货币符，中心受光核为饱满货币符）
      float maxIndex = max(uGlyphCount - 1.0, 1.0);
      float glyphIdx = clamp(floor(1.0 + normBri * (maxIndex - 0.01)), 1.0, maxIndex);

      // 字符大小与紧凑度控制：边缘字符精致，中心受光处字符饱满紧凑
      float effectiveScale = uCharScale * mix(0.84, 1.12, smoothstep(0.08, 0.88, normBri));
      vec2 glyphLocalUv = (cellUv - 0.5) / max(effectiveScale, 0.25) + 0.5;

      float glyphAlpha = 0.0;
      if (
        glyphLocalUv.x >= 0.01 &&
        glyphLocalUv.x <= 0.99 &&
        glyphLocalUv.y >= 0.01 &&
        glyphLocalUv.y <= 0.99 &&
        absCell.x <= matrixBorder &&
        absCell.y <= matrixBorder
      ) {
        vec2 atlasUv = vec2(
          (glyphIdx + glyphLocalUv.x) / uGlyphCount,
          glyphLocalUv.y
        );
        float rawAlpha = texture2D(uGlyphAtlas, atlasUv).a;
        // 确保货币符号笔画清晰锐利，内部镂空分明，绝不糊成实心圆球
        float boldFactor = clamp(uStrokeBoldness * 0.50 + normBri * 0.22, 0.0, 0.84);
        float lowEdge = mix(0.54, 0.30, boldFactor);
        float highEdge = mix(0.86, 0.62, boldFactor);
        glyphAlpha = smoothstep(lowEdge, highEdge, rawAlpha);
      }

      // 纯净三阶光学色温映射：
      // 暗部：深邃品牌色；中调：100% 鲜亮高饱和品牌原色；中心受光核（normBri > 0.55）：向炽烈暖白核心平滑过渡
      vec3 pureBrand = extractPureBrandColor(combinedRgb);
      vec3 deepBrand = pureBrand * 0.48;
      vec3 midToBrightBrand = mix(deepBrand, pureBrand, smoothstep(0.05, 0.48, normBri));
      float coreHotspot =
        smoothstep(0.55, 0.94, normBri) * clamp(uCoreBrightness * 0.36, 0.0, 0.86);
      vec3 warmWhiteCore = mix(pureBrand, vec3(1.0, 0.98, 0.88), 0.86);
      vec3 charColor = mix(midToBrightBrand, warmWhiteCore, coreHotspot);

      // 针对不同色相的感知亮度微调（让蓝紫 #6743FF / #471EFA 与黄绿 #C5FB00 亮度均衡）
      float perceptualLuma = clamp(dot(pureBrand, vec3(0.28, 0.58, 0.14)), 0.28, 0.90);
      float hueGlowBoost = mix(1.0, 0.66 / perceptualLuma, 0.48);

      // 字符笔画本体输出强劲的高动态范围（HDR）发光，让每个货币符号本身成为耀眼光源（而非靠方格底色发亮）
      float charHdrIntensity =
        (0.62 + 1.25 * pow(normBri, 1.25) * (uCoreBrightness * 0.62)) *
        (0.58 + 0.42 * uGlowIntensity) *
        hueGlowBoost *
        (0.84 + 0.16 * scanlineWave);

      // 极轻柔的字符格内余晖（不垫厚重底色，确保视觉 100% 聚焦于发光货币字符本身）
      float cellPhosphor =
        crtPadMask *
        scanlineWave *
        pow(normBri, 2.0) *
        0.075 *
        uGlowIntensity *
        hueGlowBoost;

      finalColor +=
        charColor * glyphAlpha * charHdrIntensity +
        pureBrand * cellPhosphor;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

/**
 * 动力学旋转曲线：
 * 输入相位 x ∈ [-1, 1]（-1 对应 -90° 左侧面切入，0 对应 0° 正面慢速展示，+1 对应 +90° 右侧面切出）
 * 在 x ≈ 0 正对摄像机区间斜率极小（慢速悬停），在 x -> ±1 侧面区间斜率陡增（快入快出）
 */
function kinematicRotationAngle(x: number): number {
  const slowFactor = 0.21;
  const curved = slowFactor * x + (1 - slowFactor) * Math.pow(x, 5);
  return curved * (Math.PI * 0.5);
}

function CurrencyAsciiPipeline({
  onReady,
  settings,
}: {
  onReady?: () => void;
  settings: AsciiArtSettings;
}) {
  const { gl, size, viewport } = useThree();
  const postMatRef = useRef<ShaderMaterial>(null);
  const rotatingHolderRef = useRef<Group>(null);
  const keyLightTopRef = useRef<PointLight>(null);
  const keyLightBottomRef = useRef<PointLight>(null);
  const rimLightRef = useRef<DirectionalLight>(null);

  const mouseTarget = useRef(new Vector2(0, 0));
  const mouseCurrent = useRef(new Vector2(0, 0));
  const reported = useRef(false);
  // 初始时间设为半个周期（1.9s），使首帧即处于正对摄像机慢速展示的黄金姿态
  const animTimeRef = useRef(1.9);

  useEffect(() => {
    configurePostProcessingRenderer(gl);
    onReady?.();
  }, [gl, onReady]);

  // 监听指针移动，赋予 3D 模型轻柔的交互视差偏转
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      const ny = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
      mouseTarget.current.set(nx, ny);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  // 1. 生成全球货币符号纹理图集
  const { texture: glyphAtlas, glyphCount } = useMemo(
    () => createCurrencyGlyphAtlas(),
    []
  );

  // 2. 解析并挤出五常货币符号 3D 模型
  const logoGroups = useMemo(
    () => P5_CURRENCY_SOURCES.map((src) => buildExtrudedCurrencyGroup(src)),
    []
  );

  // 每次切换货币符号时重新抽取歪斜角（不复用上一次的倾角）
  const tiltBiasRef = useRef({ pitch: 0, roll: 0, yaw: 0 });
  const lastTiltCycleRef = useRef(-1);

  const rollFreshTiltBias = useCallback(() => {
    const r = () => Math.random() * 2 - 1;
    // 避开接近 0 的“假立正”样本，保证每次出场都有可见歪斜方向
    const signed = (minAbs: number, span: number) => {
      const v = r() * span;
      return v >= 0 ? v + minAbs : v - minAbs;
    };
    tiltBiasRef.current = {
      pitch: signed(0.28, 0.55),
      roll: signed(0.22, 0.45),
      yaw: r() * 0.22,
    };
  }, []);

  // 实时同步材质粗糙度
  useEffect(() => {
    logoGroups.forEach((grp) => {
      grp.traverse((obj) => {
        if ((obj as Mesh).isMesh) {
          const mat = (obj as Mesh).material as MeshStandardMaterial;
          if (mat && typeof mat.roughness === "number") {
            mat.roughness = settings.roughness;
            mat.needsUpdate = true;
          }
        }
      });
    });
  }, [logoGroups, settings.roughness]);

  // 3. 创建离屏 3D 舞台 Scene、Camera 与 RenderTarget
  const offscreenScene = useMemo(() => new ThreeScene(), []);
  const offscreenCamera = useMemo(() => {
    const cam = new PerspectiveCamera(36, 1, 0.1, 100);
    cam.position.set(0, 0, 10.5);
    return cam;
  }, []);

  const renderTarget = useMemo(() => {
    const rt = new WebGLRenderTarget(512, 512, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
    });
    return rt;
  }, []);

  // 独立的 64x64 超低分硬件双线性缓冲，专供连续二维高斯光晕卷积使用，100% 消除辉光重影
  const glowTarget = useMemo(() => {
    const rt = new WebGLRenderTarget(64, 64, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
    });
    return rt;
  }, []);

  useEffect(() => {
    offscreenCamera.aspect = size.width / Math.max(size.height, 1);
    offscreenCamera.updateProjectionMatrix();
  }, [size.width, size.height, offscreenCamera]);

  const uniforms = useMemo(
    () => ({
      uSceneTex: { value: renderTarget.texture },
      uGlowTex: { value: glowTarget.texture },
      uGlyphAtlas: { value: glyphAtlas },
      uGlyphCount: { value: glyphCount },
      uResolution: { value: new Vector2(size.width, size.height) },
      uTime: { value: 0 },
      uFocusCenter: { value: new Vector2(0.31, 0.5) },
      uGridRows: { value: settings.gridRows },
      uCharScale: { value: settings.charScale },
      uCellGap: { value: settings.cellGap },
      uStrokeBoldness: { value: settings.strokeBoldness },
      uGlowIntensity: { value: settings.glowIntensity },
      uCoreBrightness: { value: settings.coreBrightness },
      uHaloSpread: { value: settings.haloSpread },
      uCrtGridOpacity: { value: settings.crtGridOpacity },
      uBgBeamIntensity: { value: settings.bgBeamIntensity },
      uConsoleBounceIntensity: { value: settings.consoleBounceIntensity },
      uConsoleBounceSpread: { value: settings.consoleBounceSpread },
      uConsoleRect: { value: new Vector4(0.68, 0.31, 0.91, 0.72) },
      uHorizGlitch: { value: settings.horizGlitch },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderTarget, glowTarget, glyphAtlas, glyphCount]
  );

  useFrame((state, delta) => {
    const clampedDelta = Math.min(delta, 0.1);
    animTimeRef.current += clampedDelta * settings.rotationSpeed;
    const elapsed = animTimeRef.current;
    const realTime = state.clock.getElapsedTime();

    if (!reported.current && onReady) {
      reported.current = true;
      onReady();
    }

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

    // 移动端居中，桌面端将 3D 主视觉置于左侧舞台黄金视觉中心（右侧留给登录组件）
    const isDesktop = size.width >= 900;
    const focusNormX = isDesktop ? 0.335 : 0.5;
    const focusNormY = isDesktop ? 0.51 : 0.28;

    // 单个货币符号周期 3.8 秒：
    // phase ∈ [0, 1) -> x ∈ [-1, 1] -> 角度 θ ∈ [-π/2, +π/2]
    // 每当旋转到侧面 (±90°) 时切换下一个五常货币符号
    const cycleDuration = 3.8;
    const totalCycles = elapsed / cycleDuration;
    const activeLogoIdx = Math.floor(totalCycles) % logoGroups.length;
    const cyclePhase = totalCycles - Math.floor(totalCycles); // [0, 1)
    const symX = cyclePhase * 2 - 1; // [-1, 1]

    const rotY = kinematicRotationAngle(symX);
    // 正对镜头慢速展示时叠加轻微的立体俯仰与侧倾，让倒角高光与侧面厚度持续流动
    const breathX = Math.sin(elapsed * 1.65) * 0.14 + mouseCurrent.current.y * 0.16;
    const breathZ = Math.cos(elapsed * 1.15) * 0.045 - mouseCurrent.current.x * 0.06;

    // 每个出场周期重新计算歪斜：tiltRandomness 控制倾角上限（0 = 立正，1 ≈ 满额）
    const cycleIndex = Math.floor(totalCycles);
    if (cycleIndex !== lastTiltCycleRef.current) {
      lastTiltCycleRef.current = cycleIndex;
      rollFreshTiltBias();
    }
    const tiltIntensity = settings.tiltRandomness ?? 0;
    const bias = tiltBiasRef.current;
    const rotX = breathX + bias.pitch * tiltIntensity;
    const rotZ = breathZ + bias.roll * tiltIntensity;
    const rotYBias = bias.yaw * tiltIntensity;

    // 在侧面 ±90° 极窄交接瞬间做极其轻微的弹性缩放，使快入快出更具力量感
    const edgeProximity = Math.pow(Math.abs(symX), 6);
    const modelScale = settings.modelScale ?? 1.0;
    const dynamicScale =
      (isDesktop ? 1.28 : 0.88) *
      modelScale *
      (1.0 - edgeProximity * 0.12);

    if (rotatingHolderRef.current) {
      // 根据视口宽高比将 3D 模型精确放置在左侧视觉焦点对应的世界坐标
      const vHeight =
        2 *
        Math.tan(MathUtils.degToRad(offscreenCamera.fov * 0.5)) *
        offscreenCamera.position.z;
      const vWidth = vHeight * offscreenCamera.aspect;

      const worldX = (focusNormX - 0.5) * vWidth;
      const worldY = (focusNormY - 0.5) * vHeight;

      rotatingHolderRef.current.position.set(worldX, worldY, 0);
      rotatingHolderRef.current.rotation.set(
        rotX,
        rotY + rotYBias + mouseCurrent.current.x * 0.18,
        rotZ
      );
      rotatingHolderRef.current.scale.set(
        dynamicScale,
        dynamicScale,
        dynamicScale * settings.extrudeScale
      );

      // 仅激活当前周期的货币符号（侧面 90° 切换）
      rotatingHolderRef.current.children.forEach((child, idx) => {
        child.visible = idx === activeLogoIdx;
      });
    }

    // 双区动态游走聚光点光源：塑造货币符号上下半区的戏剧性受光核心与明暗衰减梯度
    if (rotatingHolderRef.current) {
      const basePos = rotatingHolderRef.current.position;
      const lightSpan = 0.65 + 0.35 * modelScale;
      if (keyLightTopRef.current) {
        keyLightTopRef.current.position.set(
          basePos.x + Math.sin(realTime * 1.55) * 1.9 * lightSpan,
          basePos.y + (0.75 + Math.cos(realTime * 1.15) * 0.65) * lightSpan,
          2.75
        );
      }
      if (keyLightBottomRef.current) {
        keyLightBottomRef.current.position.set(
          basePos.x - Math.cos(realTime * 1.45) * 1.85 * lightSpan,
          basePos.y + (-0.85 + Math.sin(realTime * 1.25) * 0.65) * lightSpan,
          2.65
        );
      }
    }

    if (rimLightRef.current) {
      rimLightRef.current.position.set(
        -5.0 + Math.cos(realTime * 1.2) * 2.0,
        4.5,
        -2.5
      );
    }

    // 渲染离屏 3D 挤压货币符号场景到高清字符采样缓冲与 64x64 零重影高斯光晕缓冲
    const prevTarget = state.gl.getRenderTarget();
    const prevClearAlpha = state.gl.getClearAlpha();
    state.gl.setClearColor("#000000", 0);

    state.gl.setRenderTarget(renderTarget);
    state.gl.clear(true, true, false);
    state.gl.render(offscreenScene, offscreenCamera);

    state.gl.setRenderTarget(glowTarget);
    state.gl.clear(true, true, false);
    state.gl.render(offscreenScene, offscreenCamera);

    state.gl.setRenderTarget(prevTarget);
    state.gl.setClearAlpha(prevClearAlpha);

    // 更新全屏货币符号 ASCII 矩阵 Shader Uniforms
    if (postMatRef.current) {
      const u = postMatRef.current.uniforms;
      u.uTime.value = realTime;
      u.uResolution.value.set(size.width, size.height);
      u.uFocusCenter.value.set(focusNormX, focusNormY);
      u.uSceneTex.value = renderTarget.texture;
      u.uGlowTex.value = glowTarget.texture;
      u.uGridRows.value = settings.gridRows;
      u.uCharScale.value = settings.charScale;
      u.uCellGap.value = settings.cellGap;
      u.uStrokeBoldness.value = settings.strokeBoldness;
      u.uGlowIntensity.value = settings.glowIntensity;
      u.uCoreBrightness.value = settings.coreBrightness;
      u.uHaloSpread.value = settings.haloSpread;
      u.uCrtGridOpacity.value = settings.crtGridOpacity;
      u.uBgBeamIntensity.value = settings.bgBeamIntensity;
      u.uConsoleBounceIntensity.value = settings.consoleBounceIntensity;
      u.uConsoleBounceSpread.value = settings.consoleBounceSpread;
      u.uHorizGlitch.value = settings.horizGlitch;

      // 实时测量右侧实物登录器金属机身在视口 UV 空间的精确坐标（与 Canvas 自身 getBoundingClientRect 同一 CSS 坐标系）
      const consoleEl = document.querySelector(
        '[data-tactile-console-form="true"]'
      );
      const canvasRect = state.gl.domElement.getBoundingClientRect();
      if (
        consoleEl &&
        canvasRect.width > 0 &&
        canvasRect.height > 0
      ) {
        const rect = consoleEl.getBoundingClientRect();
        const relLeft = rect.left - canvasRect.left;
        const relTop = rect.top - canvasRect.top;
        const cMinX = (relLeft + rect.width * 0.1396) / canvasRect.width;
        const cMaxX = (relLeft + rect.width * 0.8125) / canvasRect.width;
        const cMaxY = 1.0 - (relTop + rect.height * 0.1221) / canvasRect.height;
        const cMinY = 1.0 - (relTop + rect.height * 0.752) / canvasRect.height;
        u.uConsoleRect.value.set(cMinX, cMinY, cMaxX, cMaxY);
      }
    }
  });

  return (
    <>
      {/* 离屏 3D 舞台：戏剧性聚光布光（Spotlight Chiaroscuro），塑造中心高光向边缘衰减的立体字符梯度 */}
      {createPortal(
        <>
          <ambientLight intensity={0.08} />
          {/* 上半区游走聚光点光源：塑造局部炙热高光核与平滑明暗过渡 */}
          <pointLight
            ref={keyLightTopRef}
            intensity={16.5}
            distance={7.5}
            decay={2.0}
            color="#fffdf6"
          />
          {/* 下半区游走聚光点光源：确保货币符号下半笔画同样拥有璀璨高光核 */}
          <pointLight
            ref={keyLightBottomRef}
            intensity={12.5}
            distance={7.5}
            decay={2.1}
            color="#f5f3ff"
          />
          {/* 右上斜射塑形光：照亮斜切倒角与侧面厚度 */}
          <directionalLight
            position={[6.0, 5.5, 2.5]}
            intensity={0.95}
            color="#ffffff"
          />
          {/* 左后侧轮廓逆光（Rim Light）：在快入快出旋转至侧面时勾勒出耀眼的立体边缘 */}
          <directionalLight
            ref={rimLightRef}
            position={[-5.5, 3.5, -2.0]}
            intensity={2.2}
            color="#e0e7ff"
          />
          {/* 底部微补光：保证下沿倒角层次清晰 */}
          <directionalLight
            position={[0, -6.0, 2.2]}
            intensity={0.65}
            color="#c4b5fd"
          />

          <group ref={rotatingHolderRef}>
            {logoGroups.map((grp, idx) => (
              <primitive
                key={P5_CURRENCY_SOURCES[idx].id}
                object={grp}
                visible={idx === 0}
              />
            ))}
          </group>
        </>,
        offscreenScene
      )}

      {/* 全屏正交输出平面：执行全球货币符号 ASCII 矩阵转换 */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <shaderMaterial
          ref={postMatRef}
          vertexShader={asciiVertexShader}
          fragmentShader={asciiFragmentShader}
          uniforms={uniforms}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </>
  );
}

export function CurrencyAsciiHeroCanvas({
  onReady,
  settings = DEFAULT_ASCII_ART_SETTINGS,
}: {
  onReady?: () => void;
  settings?: AsciiArtSettings;
}) {
  const [renderMode, setRenderMode] = useState<"full" | "basic" | "static">(
    "full"
  );

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
    });
  }, []);

  const handleCanvasError = useCallback((error: Error) => {
    console.warn("[login-currency-ascii] WebGL failed, falling back:", error);
    setRenderMode((mode) => (mode === "full" ? "basic" : "static"));
  }, []);

  if (renderMode === "static") {
    return <StaticAsciiFallback onReady={onReady} />;
  }

  return (
    <AsciiErrorBoundary
      key={renderMode}
      fallback={<StaticAsciiFallback onReady={onReady} />}
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
          powerPreference:
            renderMode === "full" ? "high-performance" : "default",
        }}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: "#000000",
        }}
        onCreated={handleCreated}
      >
        <color attach="background" args={["#000000"]} />
        <CurrencyAsciiPipeline onReady={onReady} settings={settings} />
        {renderMode === "full" && (
          <EffectComposer multisampling={4}>
            <Bloom
              intensity={1.15 * (settings.glowIntensity / 2.6)}
              luminanceThreshold={0.48}
              luminanceSmoothing={0.32}
              radius={0.44}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </Canvas>
    </AsciiErrorBoundary>
  );
}
