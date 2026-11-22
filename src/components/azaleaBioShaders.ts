import { CanvasTexture, LinearFilter } from "three";

/**
 * 示波器波形与植物生物电混合字符集（兼顾神经脉冲波形、热成像等高线与大紫杜鹃花冠轮廓）
 */
export const BIO_ELECTRIC_ASCII_SYMBOLS = [
  "·",
  ":",
  "-",
  "~",
  "+",
  "=",
  "x",
  "^",
  "*",
  "∆",
  "◊",
  "✦",
  "%",
  "@",
  "❀",
  "✿",
];

/**
 * 构建植物生物电与热成像符号图集（Bio-Electric Glyph Atlas）
 * 测量真实像素墨水密度并升序排列，过滤 density >= 0.34 的过密实心块，对花朵符号做中心镂空保护。
 */
export function createBioElectricGlyphAtlas(): {
  texture: CanvasTexture;
  glyphCount: number;
} {
  const uniqueSymbols = Array.from(new Set(BIO_ELECTRIC_ASCII_SYMBOLS));
  const cellSize = 96;
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = cellSize;
  measureCanvas.height = cellSize;
  const mCtx = measureCanvas.getContext("2d", { willReadFrequently: true });

  const baseFontStack =
    '700 72px "SF Mono", "Menlo", "Monaco", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const floralFontStack =
    '500 62px "Apple Symbols", "Hiragino Sans", "PingFang SC", -apple-system, sans-serif';

  const isSpecialSymbol = (ch: string) =>
    ch === "❀" || ch === "✿" || ch === "✦" || ch === "∆" || ch === "◊";

  interface MeasuredGlyph {
    char: string;
    density: number;
  }

  const measured: MeasuredGlyph[] = [];

  if (mCtx) {
    for (const char of uniqueSymbols) {
      mCtx.clearRect(0, 0, cellSize, cellSize);
      mCtx.fillStyle = "#ffffff";
      mCtx.font = isSpecialSymbol(char) ? floralFontStack : baseFontStack;
      mCtx.textAlign = "center";
      mCtx.textBaseline = "middle";
      mCtx.fillText(char, cellSize / 2, cellSize / 2 + 2);

      const img = mCtx.getImageData(0, 0, cellSize, cellSize).data;
      let inkSum = 0;
      for (let i = 3; i < img.length; i += 4) {
        inkSum += img[i];
      }
      const density = inkSum / (cellSize * cellSize * 255);
      if (density > 0.002 && density < 0.34) {
        measured.push({ char, density });
      }
    }
  }

  measured.sort((a, b) => a.density - b.density);

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
      const cy = cellSize * 0.5 + 2;

      ctx.save();
      ctx.font = isSpecialSymbol(ch) ? floralFontStack : baseFontStack;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, cx, cy);

      if (ch === "✿" || ch === "❀") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 8.5, 0, Math.PI * 2);
        ctx.fill();
      }
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
 * 大紫杜鹃生物电顶点着色器：
 * - 读取 Blender 离线烘焙的 _azalea_meta 四通道属性：
 *   R: geodesicDist (0.0 根部 -> 1.0 花瓣尖端)
 *   G: organType (0.0 木质枝干, 0.5 叶片/花萼, 1.0 杜鹃花瓣)
 *   B: bioNodeWeight (花蕊/花喉突触电导权重)
 *   A: sculptedShade (3D 立体雕塑光度)
 * - 基于测地线距离驱动柔和连贯的枝花一体呼吸微颤与生物电脉冲张力
 */
export const azaleaBioVertexShader = /* glsl */ `
  attribute vec4 _azalea_meta;

  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uPulseIntensity;
  uniform vec3 uPointerWorld;
  uniform float uPointerStimulus;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vAzaleaMeta;
  varying float vActionPotential;
  varying float vPointerExcitation;

  vec2 rotate2D(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    vUv = uv;
    vAzaleaMeta = _azalea_meta;
    vLocalPos = position;

    float geodesicDist = _azalea_meta.x;
    float organType = _azalea_meta.y;

    // 周期性主动作电位波：从根部 (0.0) 向花冠尖端 (1.0) 涌动
    float wavePhase = fract(uTime * 0.28 * uPulseSpeed);
    float waveCenter = mix(-0.18, 1.22, wavePhase);
    float distToFront = geodesicDist - waveCenter;
    float sharpFront = exp(-max(distToFront, 0.0) * 18.0);
    float expTail = exp(-max(-distToFront, 0.0) * 5.2);
    float primaryWave = sharpFront * expTail * smoothstep(-0.28, 0.04, distToFront);

    // 第二道次级谐波脉冲（相位差 0.5）
    float subPhase = fract(uTime * 0.28 * uPulseSpeed + 0.5);
    float subCenter = mix(-0.15, 1.18, subPhase);
    float subDiff = geodesicDist - subCenter;
    float subWave = exp(-max(subDiff, 0.0) * 20.0) * exp(-max(-subDiff, 0.0) * 6.5) * 0.45;

    float actionPotential = clamp((primaryWave + subWave) * uPulseIntensity, 0.0, 1.8);
    vActionPotential = actionPotential;

    // 枝花一体的柔和呼吸微摆（围绕底部根部支点微幅摆动，保证零撕裂）
    vec3 pos = position;
    vec3 norm = normalize(normal);
    vec2 rootPivot = vec2(0.15, -1.85);
    float flexFactor = smoothstep(0.05, 0.95, geodesicDist);
    float breathAngleXY =
      (sin(uTime * 0.95) * 0.018 + cos(uTime * 0.62 + 1.1) * 0.012) * flexFactor;
    float breathAngleXZ =
      sin(uTime * 0.78 + 0.4) * 0.015 * flexFactor;

    pos.xy = rootPivot + rotate2D(pos.xy - rootPivot, breathAngleXY);
    norm.xy = rotate2D(norm.xy, breathAngleXY);
    pos.xz = rotate2D(pos.xz, breathAngleXZ);
    norm.xz = rotate2D(norm.xz, breathAngleXZ);

    // 动作电位通过花瓣时产生微弱的生物电膨胀律动
    float bioSwell = actionPotential * smoothstep(0.35, 1.0, organType) * 0.032;
    pos += norm * bioSwell;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    // 鼠标靠近时的局部钙离子电刺激
    float dPointer = length(vWorldPos.xy - uPointerWorld.xy);
    float ptrExcite = exp(-dPointer * dPointer * 0.85) * uPointerStimulus;
    vPointerExcitation = ptrExcite;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * 大紫杜鹃生物电与四阶伪彩光谱片元着色器：
 * - uSpectrumMode:
 *   0: Infrared Thermal（红外热成像：深蓝枝干 #101D5A -> 洋红花萼 #B81868 -> 炽橙 #FF8C1A -> 淡黄高热脉冲核 #FFF7C2）
 *   1: Bioluminescent（深海生物荧光：深渊青 #084C5C -> 荧光翡翠 #10E8A8 -> 电光紫 #9D4EFF -> 冰蓝脉冲核 #D6F8FF）
 *   2: Natural Azalea（原生大紫杜鹃：暖褐枝干 -> 苍翠叶片 -> 艳丽大紫杜鹃 #D92B8A / #FF6EC7 + 金色生物电脉络）
 *   3: Monochrome Phosphor（单色医疗示波器：经典 P39 荧光绿 #18C860 -> #8EFFB8）
 */
export const azaleaBioFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uSpectrumMode;
  uniform float uPulseSpeed;
  uniform float uPulseIntensity;
  uniform float uThermalSpread;
  uniform vec3 uPointerWorld;
  uniform float uPointerStimulus;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vAzaleaMeta;
  varying float vActionPotential;
  varying float vPointerExcitation;

  void main() {
    vec4 texCol = texture2D(uMap, vUv);
    vec3 rawRgb = pow(max(texCol.rgb, vec3(0.0001)), vec3(1.0 / 2.2));

    float geodesicDist = vAzaleaMeta.x;
    float organType = vAzaleaMeta.y;
    float bioNodeWeight = vAzaleaMeta.z;
    float sculptedShade = vAzaleaMeta.w;

    float texLuma = dot(rawRgb, vec3(0.299, 0.587, 0.114));

    // 基于还原后的 sRGB 贴图物理色相精准分离：
    // 大紫杜鹃底部橄榄绿叶片与黄绿花萼满足 G > B + 0.035；而上部紫罗兰洋红花瓣满足 B > G 且 R > 0.36！
    float texLeaf =
      smoothstep(0.025, 0.11, rawRgb.g - rawRgb.b) *
      smoothstep(0.12, 0.24, rawRgb.g) *
      (1.0 - smoothstep(0.46, 0.62, rawRgb.r));
    float texPetal =
      smoothstep(0.35, 0.52, rawRgb.r) *
      smoothstep(-0.01, 0.09, rawRgb.b - rawRgb.g) *
      smoothstep(0.08, 0.20, rawRgb.r - rawRgb.g) *
      (1.0 - texLeaf);

    float metaPetal = smoothstep(0.65, 0.92, organType);
    float metaLeaf = smoothstep(0.22, 0.46, organType) * (1.0 - metaPetal);

    float isLeaf = clamp(max(texLeaf, metaLeaf * 0.8), 0.0, 1.0);
    float isPetal = clamp(max(texPetal, metaPetal * 0.7) * (1.0 - isLeaf), 0.0, 1.0);
    float isStem = clamp(1.0 - max(isPetal, isLeaf), 0.0, 1.0);

    // 提纯原贴图真实色彩饱和度与花瓣褶皱对比度（保留三朵杜鹃花交界处的深色阴影缝隙与底部翠绿叶片！）
    float maxCh = max(rawRgb.r, max(rawRgb.g, rawRgb.b));
    vec3 normTex = maxCh > 0.01 ? (rawRgb / maxCh) : vec3(0.85, 0.3, 0.65);
    float avgCh = (normTex.r + normTex.g + normTex.b) / 3.0;
    vec3 vividTexCol = clamp(mix(vec3(avgCh), normTex, 1.55), 0.0, 1.0);
    // 针对摄影测量贴图的真实 sRGB 亮度区间 [0.36, 0.70] 做高对比拉伸，释放花瓣暗槽、蜜导斑点与受光瓣面的层次
    float texDetailContrast = pow(smoothstep(0.36, 0.70, texLuma), 1.25);

    // 实时法线、视线掠角暗边与屏幕空间深度断层暗沟（切分重叠花朵与卷曲花瓣边缘）
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vec3(0.0, 0.0, 10.5) - vWorldPos);
    vec3 keyLightDir = normalize(vec3(-0.42, 0.56, 0.71));
    float liveNdotL = clamp(dot(N, keyLightDir) * 0.55 + 0.45, 0.0, 1.0);
    float viewDot = abs(dot(N, V));
    float silhouetteMoat = smoothstep(0.08, 0.48, viewDot);
    float depthJump = length(vec2(dFdx(vWorldPos.z), dFdy(vWorldPos.z)));
    float depthMoat = 1.0 - 0.78 * smoothstep(0.03, 0.16, depthJump);

    // 1. 周期性测地线动作电位波（沿维管束与五瓣主脉锐利推进）
    float spreadFactor = clamp(uThermalSpread, 0.25, 2.2);
    float wavePhase = fract(uTime * 0.28 * uPulseSpeed);
    float waveCenter = mix(-0.14, 1.18, wavePhase);
    float dFront = geodesicDist - waveCenter;
    float pulseFront = exp(-max(dFront, 0.0) * (26.0 / spreadFactor));
    float pulseTail = exp(-max(-dFront, 0.0) * (6.8 / spreadFactor));
    float mainWave = pulseFront * pulseTail * smoothstep(-0.26 * spreadFactor, 0.03, dFront);

    // 次级谐波与花蕊/蜜导斑点突触放电
    float subPhase = fract(uTime * 0.28 * uPulseSpeed + 0.5);
    float subCenter = mix(-0.12, 1.14, subPhase);
    float dSub = geodesicDist - subCenter;
    float subWave =
      exp(-max(dSub, 0.0) * (28.0 / spreadFactor)) *
      exp(-max(-dSub, 0.0) * (7.5 / spreadFactor)) *
      0.42;

    float synapticSpark =
      smoothstep(0.58, 0.92, bioNodeWeight) *
      isPetal *
      (0.55 + 0.45 * sin(uTime * 6.5 + geodesicDist * 28.0 + vLocalPos.x * 9.0));

    // 鼠标靠近时的局部钙离子荧光涟漪
    float dPtr = length(vWorldPos.xy - uPointerWorld.xy);
    float ptrRipple =
      (0.65 + 0.35 * sin(dPtr * 9.5 - uTime * 7.2)) *
      exp(-dPtr * dPtr * (0.95 / spreadFactor)) *
      uPointerStimulus;

    // 生物电脉冲优先沿五瓣中脉、花蕊突触 (bioNodeWeight) 与花瓣隆起脊线传导，绝不冲平瓣间暗槽与花心漏斗
    float veinConductivity = 0.28 + 0.72 * smoothstep(0.18, 0.85, bioNodeWeight);
    float totalBioPulse = clamp(
      ((mainWave + subWave) * veinConductivity + synapticSpark * 0.45) * uPulseIntensity +
        ptrRipple * 0.95,
      0.0,
      1.75
    );

    // 以 Blender 烘焙的高对比五瓣解剖浮雕 (sculptedShade) 与原贴图褶皱明暗 (texDetailContrast) 为核心，叠加实时深度断层暗沟
    float rawRelief =
      (sculptedShade * 0.62 + texDetailContrast * 0.26 + liveNdotL * 0.12) *
      (0.42 + 0.58 * silhouetteMoat) *
      depthMoat;
    // S 曲线拉伸花心漏斗/花间暗槽与五瓣受光隆起面的反差
    float structuralShade = clamp(smoothstep(0.06, 0.80, rawRelief), 0.04, 0.99);
    float cleftProtect = smoothstep(0.12, 0.42, structuralShade);
    float baseOrganHeat = isStem * 0.24 + isLeaf * 0.42 + isPetal * 0.74;
    float thermalLevel = clamp(
      baseOrganHeat * (0.12 + 0.88 * structuralShade) +
        totalBioPulse * 0.44 * (0.25 + 0.75 * cleftProtect) +
        synapticSpark * 0.24,
      0.04,
      1.0
    );

    int mode = int(floor(uSpectrumMode + 0.5));
    vec3 spectrumCol = vec3(0.0);

    if (mode == 0) {
      // 0: Infrared Thermal（红外热成像：枝叶冷蓝青绿 vs 花心深紫洋红 vs 五瓣炽橙金黄 vs 花蕊纯白高热核）
      vec3 cColdBlue   = vec3(0.063, 0.125, 0.380); // #102061 幽暗深蓝枝干
      vec3 cCoolTeal   = vec3(0.075, 0.520, 0.540); // #13858A 冷青绿叶片
      vec3 cThroatPurp = vec3(0.320, 0.045, 0.340); // #520B57 花心漏斗与瓣间深紫暗槽
      vec3 cMidMagenta = vec3(0.780, 0.110, 0.430); // #C71C6E 花萼与花瓣过渡洋红
      vec3 cHotOrange  = vec3(1.000, 0.560, 0.110); // #FF8F1C 五瓣隆起炽橙
      vec3 cPeakYellow = vec3(1.000, 0.972, 0.780); // #FFF8C7 花蕊与生物电主脉高热核

      vec3 foliageCol = mix(cColdBlue, cCoolTeal, smoothstep(0.08, 0.65, structuralShade + isLeaf * 0.22));
      foliageCol = mix(foliageCol, cMidMagenta, clamp(totalBioPulse * 0.45, 0.0, 0.65));

      float petalHeat = clamp(structuralShade * 0.82 + totalBioPulse * 0.34 + synapticSpark * 0.22, 0.0, 1.0);
      vec3 corollaCol = mix(cThroatPurp, cMidMagenta, smoothstep(0.08, 0.38, petalHeat));
      corollaCol = mix(corollaCol, cHotOrange, smoothstep(0.36, 0.74, petalHeat));
      corollaCol = mix(corollaCol, cPeakYellow, smoothstep(0.72, 0.97, petalHeat));

      spectrumCol = mix(foliageCol, corollaCol, isPetal);
    } else if (mode == 1) {
      // 1: Bioluminescent（深海生物荧光：深渊青蓝枝叶 vs 幽紫花心暗槽 vs 荧光青翠/电光紫五瓣 vs 冰蓝花蕊核）
      vec3 cAbyssTeal   = vec3(0.031, 0.260, 0.340);
      vec3 cLeafCyan    = vec3(0.055, 0.780, 0.620);
      vec3 cThroatIndigo= vec3(0.180, 0.070, 0.420);
      vec3 cCyberViolet = vec3(0.620, 0.280, 1.000);
      vec3 cBioEmerald  = vec3(0.120, 0.950, 0.740);
      vec3 cIceCore     = vec3(0.860, 0.980, 1.000);

      vec3 foliageBio = mix(cAbyssTeal, cLeafCyan, smoothstep(0.08, 0.68, structuralShade));
      float petalBioHeat = clamp(structuralShade * 0.82 + totalBioPulse * 0.34 + synapticSpark * 0.22, 0.0, 1.0);
      vec3 corollaBio = mix(cThroatIndigo, cCyberViolet, smoothstep(0.08, 0.44, petalBioHeat));
      corollaBio = mix(corollaBio, cBioEmerald, smoothstep(0.42, 0.78, petalBioHeat));
      corollaBio = mix(corollaBio, cIceCore, smoothstep(0.76, 0.97, petalBioHeat));

      spectrumCol = mix(foliageBio, corollaBio, isPetal);
    } else if (mode == 2) {
      // 2: Natural Azalea（原生大紫杜鹃贴图纹理 + 翡翠叶片 + 柔和生物电高光脉络）
      vec3 stemCol = mix(vec3(0.32, 0.18, 0.09), vec3(0.86, 0.56, 0.28), structuralShade);
      vec3 leafCol = mix(
        vec3(0.08, 0.36, 0.14),
        mix(vec3(0.32, 0.96, 0.42), vividTexCol * vec3(0.65, 1.15, 0.55), 0.45),
        smoothstep(0.10, 0.78, structuralShade)
      );
      vec3 petalDark = vec3(0.34, 0.03, 0.22);
      vec3 petalMid  = vec3(0.88, 0.18, 0.60);
      vec3 petalLit  = vec3(1.00, 0.48, 0.84);
      vec3 petalHigh = vec3(1.00, 0.88, 0.96);
      vec3 gradedPetal = mix(petalDark, petalMid, smoothstep(0.08, 0.40, structuralShade));
      gradedPetal = mix(gradedPetal, petalLit, smoothstep(0.38, 0.74, structuralShade));
      gradedPetal = mix(gradedPetal, petalHigh, smoothstep(0.72, 0.96, structuralShade));
      vec3 petalCol = mix(gradedPetal, vividTexCol * (0.25 + 0.82 * structuralShade), 0.46);

      vec3 naturalBase = petalCol * isPetal + leafCol * isLeaf + stemCol * isStem;
      vec3 bioGoldVein = vec3(1.00, 0.90, 0.54);
      spectrumCol = mix(
        naturalBase,
        bioGoldVein,
        clamp(totalBioPulse * 0.42 + synapticSpark * 0.24, 0.0, 0.72)
      );
    } else {
      // 3: Monochrome Phosphor（单色医疗示波器 P39 荧光绿）
      vec3 pDark = vec3(0.02, 0.18, 0.07);
      vec3 pMid  = vec3(0.094, 0.784, 0.376); // #18C860
      vec3 pPeak = vec3(0.620, 1.000, 0.760); // #9EFFC2
      spectrumCol = mix(pDark, pMid, smoothstep(0.08, 0.52, thermalLevel));
      spectrumCol = mix(spectrumCol, pPeak, smoothstep(0.50, 0.96, thermalLevel));
    }

    // 拉大暗谷 (0.07) 与花瓣受光脊/花蕊 (0.97) 的输出亮度动态范围，让五瓣分界暗槽与深陷花心一目了然
    float pulseLumaBoost = totalBioPulse * 0.26 * (0.20 + 0.80 * cleftProtect) + synapticSpark * 0.22;
    float lumaScale = mix(0.07, 0.97, clamp(structuralShade * 0.86 + pulseLumaBoost, 0.0, 1.0));
    gl_FragColor = vec4(clamp(spectrumCol * lumaScale, 0.0, 0.98), 1.0);
  }
`;

export const azaleaAsciiVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const azaleaAsciiFragmentShader = /* glsl */ `
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
  uniform float uSpectrumMode;
  uniform float uBioBouncePulse;

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

  vec3 extractPureBioColor(vec3 rawRgb) {
    float peak = max(rawRgb.r, max(rawRgb.g, rawRgb.b));
    if (peak < 0.0005) return vec3(0.0);
    vec3 normCol = rawRgb / peak;
    float avg = (normCol.r + normCol.g + normCol.b) / 3.0;
    return clamp(mix(vec3(avg), normCol, 1.38), 0.0, 1.0);
  }

  void main() {
    float targetRows = clamp(uGridRows, 24.0, 110.0);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 gridDims = vec2(floor(targetRows * aspect), targetRows);

    vec2 gridCoord = vUv * gridDims;
    vec2 cellIndex = floor(gridCoord);
    vec2 cellUv = fract(gridCoord);

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

    vec4 sCenter = texture2D(uSceneTex, jitteredCenterUv);
    float stepX = 1.0 / gridDims.x;
    float stepY = 1.0 / gridDims.y;
    vec4 sUp = texture2D(uSceneTex, jitteredCenterUv + vec2(0.0, stepY * 0.42));
    vec4 sDown = texture2D(uSceneTex, jitteredCenterUv - vec2(0.0, stepY * 0.42));
    vec4 sLeft = texture2D(uSceneTex, jitteredCenterUv - vec2(stepX * 0.42, 0.0));
    vec4 sRight = texture2D(uSceneTex, jitteredCenterUv + vec2(stepX * 0.42, 0.0));

    vec3 neighborMean = (sUp.rgb + sDown.rgb + sLeft.rgb + sRight.rgb) * 0.25;
    // 亚格子反锐化掩模 (Unsharp Mask)：强化花瓣边界暗槽、五瓣裂口与花心细长雄蕊的局部对比度
    vec3 combinedRgb = clamp(
      mix(sCenter.rgb * 0.68 + neighborMean * 0.32, sCenter.rgb * 1.32 - neighborMean * 0.32, 0.55),
      0.0,
      1.0
    );

    float pUp = max(sUp.r, max(sUp.g, sUp.b));
    float pDown = max(sDown.r, max(sDown.g, sDown.b));
    float pLeft = max(sLeft.r, max(sLeft.g, sLeft.b));
    float pRight = max(sRight.r, max(sRight.g, sRight.b));
    float neighborPresence = (pUp + pDown + pLeft + pRight) * 0.25;
    float interiorFactor = smoothstep(0.01, 0.36, neighborPresence);

    vec3 blurNear = vec3(0.0);
    vec3 blurWide = vec3(0.0);
    float gaussWeightSum = 0.0;
    float spreadClamped = clamp(uHaloSpread, 0.2, 2.5);
    vec2 nearStep = vec2(1.0 / aspect, 1.0) * (0.011 * spreadClamped);
    vec2 wideStep = vec2(1.0 / aspect, 1.0) * (0.024 * spreadClamped);

    for (int ix = -2; ix <= 2; ix++) {
      for (int iy = -2; iy <= 2; iy++) {
        vec2 gridOff = vec2(float(ix), float(iy));
        float w = exp(-dot(gridOff, gridOff) * 0.42);
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
    vec3 pureHaloCol = extractPureBioColor(haloRgb + vec3(0.0001));
    float haloEnergy = clamp((nearPeak * 1.05 + widePeak * 0.55) * uHaloSpread, 0.0, 1.75);
    float wideAura = clamp(widePeak * 1.10 * uHaloSpread, 0.0, 1.2);

    vec2 absCell = abs(cellUv - 0.5);
    float matrixBorder = max(0.5 - uCellGap, 0.22);
    float crtPadMask =
      smoothstep(matrixBorder + 0.02, matrixBorder - 0.02, absCell.x) *
      smoothstep(matrixBorder + 0.02, matrixBorder - 0.02, absCell.y);
    float crtSubDot = smoothstep(0.42, 0.08, length(cellUv - 0.5));
    float scanlineWave = 0.38 + 0.62 * cos((cellUv.y - 0.5) * 6.2831853);
    float rowScanBand =
      0.74 +
      0.26 * sin(rowY * 3.14159) +
      0.55 * smoothstep(0.58, 0.95, rowWave) * uHorizGlitch;

    vec2 normPos = (sampleCenterUv - uFocusCenter) * vec2(aspect, 1.0);
    float studioVignette = exp(-dot(normPos, normPos) * 3.8);

    vec3 ambientCrtTint = vec3(0.045, 0.048, 0.062);
    vec3 activeHaloTint = mix(pureHaloCol, vec3(0.95, 0.96, 1.0), 0.14);
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

    // 左上角斜射丁达尔背景光束
    vec2 topLeftCoord = vec2(sampleCenterUv.x * aspect, 1.0 - sampleCenterUv.y);
    vec2 beamDir = normalize(vec2(0.56, 0.828));
    vec2 beamNormal = vec2(beamDir.y, -beamDir.x);
    float beamAlong = max(dot(topLeftCoord, beamDir), 0.0);
    float beamCross = dot(topLeftCoord, beamNormal);
    float sBase = beamCross - beamAlong * 0.04 + sin(uTime * 0.52) * 0.04 * beamAlong;
    float ray1 = exp(-sqr((sBase + 0.12) / 0.11)) * 0.68;
    float ray2 = exp(-sqr((sBase - 0.18) / 0.13)) * 0.95;
    float ray3 = exp(-sqr((sBase - 0.52) / 0.16)) * 0.86;
    float ray4 = exp(-sqr((sBase - 0.88) / 0.18)) * 0.72;
    float multiRayProfile = clamp(ray1 + ray2 + ray3 + ray4, 0.0, 1.30);

    float dx = sampleCenterUv.x;
    float dy = 1.0 - sampleCenterUv.y;
    float boundaryX = mix(0.50, 0.88, sampleCenterUv.y);
    float xRatio = dx / max(boundaryX, 0.01);
    float distNorm = sqrt(xRatio * xRatio + dy * dy * 0.35);
    float falloffLinear = clamp(1.0 - smoothstep(0.05, 1.05, distNorm), 0.0, 1.0);
    float parallelLightField = multiRayProfile * falloffLinear * (0.45 + 0.55 * falloffLinear);

    // 右侧 TactileLoginConsole 边缘漫反射随当前光谱与脉冲峰值同步变色
    float consoleBounceLight = 0.0;
    float bioRimWave = 0.0;
    if (uConsoleRect.z > uConsoleRect.x) {
      vec2 cMin = uConsoleRect.xy;
      vec2 cMax = uConsoleRect.zw;
      vec2 cSize = max(cMax - cMin, vec2(0.01));
      vec2 p = sampleCenterUv;
      float cellStep = 1.0 / targetRows;
      float spread = cellStep * (2.9 * clamp(uConsoleBounceSpread, 0.2, 3.5));

      bool isLeft = p.x < (cMin.x + 0.5 * cellStep * (1.0 / aspect));
      bool isTop = p.y > (cMax.y - 0.85 * cellStep);
      if (isLeft || isTop) {
        float dxOut = max(cMin.x - p.x, 0.0) * aspect;
        float dyOut = max(p.y - cMax.y, 0.0);
        float dOuter = length(vec2(dxOut, dyOut));
        vec2 relPos = (p - cMin) / cSize;
        float topWeight = smoothstep(0.90, 0.55, relPos.x);
        float leftWeight = smoothstep(0.10, 0.35, relPos.y) * mix(0.72, 1.0, clamp(relPos.y, 0.0, 1.0));
        float bounceWeight = isLeft && !isTop ? leftWeight : (!isLeft && isTop ? topWeight : max(leftWeight, topWeight));
        if (bounceWeight > 0.001) {
          float falloff = exp(-(dOuter * dOuter) / (2.0 * spread * spread * 0.45));
          consoleBounceLight = falloff * bounceWeight * (0.70 + 0.30 * multiRayProfile);
          float pulseFlow = 0.55 + 0.45 * sin(relPos.y * 5.4 - uTime * 2.6);
          bioRimWave = consoleBounceLight * pulseFlow * clamp(uBioBouncePulse, 0.0, 1.8);
        }
      }
    }

    int mode = int(floor(uSpectrumMode + 0.5));
    vec3 spectrumAccent =
      (mode == 0) ? vec3(1.00, 0.46, 0.16) :
      (mode == 1) ? vec3(0.10, 0.92, 0.72) :
      (mode == 2) ? vec3(0.96, 0.32, 0.68) :
                    vec3(0.18, 0.92, 0.46);

    float glowingUnitMask =
      crtPadMask * (0.38 + 0.62 * crtSubDot) * (0.46 + 0.54 * scanlineWave) * rowScanBand;
    vec3 blendedBounceCol = mix(
      vec3(0.84, 0.85, 0.90),
      spectrumAccent,
      clamp(0.45 * uBioBouncePulse + 0.38 * bioRimWave, 0.0, 0.88)
    );

    finalColor +=
      (vec3(0.78, 0.80, 0.88) * parallelLightField * 0.24 * clamp(uBgBeamIntensity, 0.0, 2.5) +
        blendedBounceCol * consoleBounceLight * 0.32 * clamp(uConsoleBounceIntensity, 0.0, 3.0)) *
      glowingUnitMask;

    finalColor +=
      pureHaloCol *
      (safePow(clamp(haloEnergy * 0.65, 0.0, 1.25), 1.4) * 0.23 +
        safePow(clamp(wideAura * 0.52, 0.0, 1.0), 1.6) * 0.12) *
      scanlineWave *
      uGlowIntensity *
      0.46;

    float luma = dot(combinedRgb, vec3(0.299, 0.587, 0.114));
    float peakChannel = max(combinedRgb.r, max(combinedRgb.g, combinedRgb.b));
    float sculptedEnergy = max(luma * 0.85, peakChannel * 0.95) * (0.56 + 0.44 * interiorFactor);

    float edgeThreshold = 0.026;
    if (sculptedEnergy > edgeThreshold) {
      float smoothEdgeFade = smoothstep(edgeThreshold, edgeThreshold + 0.11, sculptedEnergy);
      float normBri = clamp(pow((sculptedEnergy - edgeThreshold) / 0.82, 0.90), 0.04, 0.999);
      float maxIndex = max(uGlyphCount - 1.0, 1.0);
      float glyphIdx = clamp(floor(1.0 + normBri * (maxIndex - 0.01)), 1.0, maxIndex);

      vec2 centroidShift =
        vec2(pRight - pLeft, pUp - pDown) /
        max(pUp + pDown + pLeft + pRight + peakChannel, 0.08) *
        0.24;

      float effectiveScale =
        uCharScale *
        mix(0.58, 1.12, smoothstep(0.04, 0.86, normBri)) *
        (0.72 + 0.28 * smoothEdgeFade);
      vec2 glyphLocalUv = (cellUv - 0.5 - centroidShift) / max(effectiveScale, 0.25) + 0.5;

      float glyphAlpha = 0.0;
      if (
        glyphLocalUv.x >= 0.01 &&
        glyphLocalUv.x <= 0.99 &&
        glyphLocalUv.y >= 0.01 &&
        glyphLocalUv.y <= 0.99 &&
        absCell.x <= matrixBorder &&
        absCell.y <= matrixBorder
      ) {
        vec2 atlasUv = vec2((glyphIdx + glyphLocalUv.x) / uGlyphCount, glyphLocalUv.y);
        float rawAlpha = texture2D(uGlyphAtlas, atlasUv).a;
        float boldFactor = clamp(uStrokeBoldness * 0.42 + normBri * 0.16, 0.0, 0.72);
        glyphAlpha = smoothstep(mix(0.56, 0.36, boldFactor), mix(0.88, 0.66, boldFactor), rawAlpha);
      }

      vec3 pureBio = extractPureBioColor(combinedRgb);
      vec3 shadowBio = pureBio * 0.30;
      vec3 midToBright = mix(shadowBio, pureBio, smoothstep(0.08, 0.56, normBri));
      float coreHotspot = smoothstep(0.66, 0.92, normBri) * clamp(uCoreBrightness * 0.32, 0.0, 0.78);
      vec3 warmCore = mix(pureBio, vec3(1.0, 0.98, 0.90), 0.82);
      vec3 charColor = mix(midToBright, warmCore, coreHotspot);

      float perceptualLuma = clamp(dot(pureBio, vec3(0.28, 0.58, 0.14)), 0.28, 0.90);
      float hueGlowBoost = mix(1.0, 0.66 / perceptualLuma, 0.45);

      float charHdrIntensity =
        (0.32 + 1.28 * pow(normBri, 1.45) * (uCoreBrightness * 0.56)) *
        (0.56 + 0.44 * uGlowIntensity) *
        hueGlowBoost *
        smoothEdgeFade *
        (0.84 + 0.16 * scanlineWave);

      float cellPhosphor =
        crtPadMask *
        scanlineWave *
        pow(normBri, 2.0) *
        0.068 *
        uGlowIntensity *
        smoothEdgeFade *
        hueGlowBoost;

      finalColor += charColor * glyphAlpha * charHdrIntensity + pureBio * cellPhosphor;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
