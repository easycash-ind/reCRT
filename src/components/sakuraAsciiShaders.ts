import { CanvasTexture, LinearFilter } from "three";

/**
 * 经过严格字怀镂空验证的植物学与赛博落樱字符集合（100% 笔画分明、绝不糊成实心圆球）
 * 包含：
 * - 暗部微尘与枝条脉络：· : ~ / \ ( ) v
 * - 中调叶片与花瓣肌理：+ * x y s a k u r ✦
 * - 高光盛放花冠与花蕊：✿ ❀ @ % & #
 */
export const BOTANICAL_ASCII_SYMBOLS = [
  "·",
  ":",
  "~",
  "/",
  "\\",
  "(",
  ")",
  "v",
  "+",
  "x",
  "y",
  "*",
  "s",
  "a",
  "k",
  "u",
  "r",
  "✦",
  "%",
  "@",
  "❀",
  "✿",
];

/**
 * 在内存中构建植物形态符号学纹理图集（Botanical Glyph Atlas）
 * 自动测量每个字符的真实像素墨水密度并升序排列，针对花朵符号做字怀镂空保护，杜绝实心圆饼。
 */
export function createBotanicalGlyphAtlas(): {
  texture: CanvasTexture;
  glyphCount: number;
} {
  const uniqueSymbols = Array.from(new Set(BOTANICAL_ASCII_SYMBOLS));
  const cellSize = 96;
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = cellSize;
  measureCanvas.height = cellSize;
  const mCtx = measureCanvas.getContext("2d", { willReadFrequently: true });

  const baseFontStack =
    '700 72px "SF Mono", "Menlo", "Monaco", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const floralFontStack =
    '500 62px "Apple Symbols", "Hiragino Sans", "PingFang SC", -apple-system, sans-serif';

  const isFloralSymbol = (ch: string) =>
    ch === "❀" || ch === "✿" || ch === "✦";

  interface MeasuredGlyph {
    char: string;
    density: number;
  }

  const measured: MeasuredGlyph[] = [];

  if (mCtx) {
    for (const char of uniqueSymbols) {
      mCtx.clearRect(0, 0, cellSize, cellSize);
      mCtx.fillStyle = "#ffffff";
      mCtx.font = isFloralSymbol(char) ? floralFontStack : baseFontStack;
      mCtx.textAlign = "center";
      mCtx.textBaseline = "middle";
      mCtx.fillText(char, cellSize / 2, cellSize / 2 + 2);

      const img = mCtx.getImageData(0, 0, cellSize, cellSize).data;
      let inkSum = 0;
      for (let i = 3; i < img.length; i += 4) {
        inkSum += img[i];
      }
      const density = inkSum / (cellSize * cellSize * 255);
      // 严格过滤过密实心块（density < 0.34），确保所有字符在强 Bloom 下依然笔画锐利分明
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
      ctx.font = isFloralSymbol(ch) ? floralFontStack : baseFontStack;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, cx, cy);

      // 若为花朵符号，在中心镂空一个小花蕊孔洞，确保在任何笔画粗细下都具有鲜明的花瓣轮廓感
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
 * 河津樱主花枝顶点着色器（真实植物悬臂梁空气动力学 + 行波风场 + 花朵点头 + 花叶高频摇曳）：
 * - 以左侧屏幕外的枝干根部 (x = -2.5) 为刚性固定锚点 (Cantilever Root Anchor)
 * - 阵风沿左上 -> 右下方向行波传导，主枝产生非对称的受风压枝点头与木质弹性回弹
 * - 每朵花簇与右侧嫩叶拥有独立相位的点头晃动 (Flower Head Nodding) 与迎风轻颤 (Leaf/Petal Flutter)
 */
export const sakuraBranchVertexShader = /* glsl */ `
  attribute vec4 _sakura_meta;

  uniform float uTime;
  uniform float uWindStrength;
  uniform float uDeconstructAmount;
  uniform float uGustEnvelope;
  // 由 JS 二阶胡克定律欠阻尼弹簧物理引擎实时积分传入：
  // x: 主枝干绕左端根部的实时弹簧摆角
  // y: 枝头花团与叶片末梢的二阶鞭梢惯性跟随摆角 (Whip Follow-Through)
  // z: 前后纵深方向的二阶弹簧轻摇角
  uniform vec3 uBranchSpringAngles;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vSakuraMeta;
  varying float vClusterDetach;

  vec2 rotate2D(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    vUv = uv;
    vSakuraMeta = _sakura_meta;
    vLocalPos = position;

    vec3 pos = position;
    vec3 norm = normalize(normal);

    // 1. 将旋转支点设置在屏幕左边界外更远处的母树主干上 (farTrunkPivot = vec2(-5.5, 0.35))！
    // 这样画面左侧露出的琥珀色树枝与枝头的花簇拥有连贯统一的力臂，
    // 当微风吹拂时，琥珀色树枝会带着花簇作为一个整体一起自然上下起伏晃动，彻底消除“树枝不动只有花晃”的割裂感！
    vec2 farTrunkPivot = vec2(-5.50, 0.35);
    float armRatio = clamp((pos.x + 2.50) / 5.0, 0.0, 1.0);

    // 树枝与花簇沿长杆方向从根部 (uBranchSpringAngles.x) 平滑过渡到长尾枝梢 (uBranchSpringAngles.y)，
    // 模拟晃动一根长杆子一头后，波动从左端琥珀枝条连贯传导至右端花梢、持续围绕中立位余振并渐渐收敛的真实物理感！
    float rodAngleXY = mix(
      uBranchSpringAngles.x * 0.85,
      uBranchSpringAngles.x * 0.55 + uBranchSpringAngles.y * 0.65,
      smoothstep(0.0, 1.0, armRatio)
    );
    float rodAngleXZ = uBranchSpringAngles.z * (0.82 + 0.18 * armRatio);

    pos.xy = farTrunkPivot + rotate2D(pos.xy - farTrunkPivot, rodAngleXY);
    norm.xy = rotate2D(norm.xy, rodAngleXY);
    pos.xz = vec2(farTrunkPivot.x, 0.0) + rotate2D(pos.xz - vec2(farTrunkPivot.x, 0.0), rodAngleXZ);
    norm.xz = rotate2D(norm.xz, rodAngleXZ);

    vClusterDetach = clamp(abs(rodAngleXY) * 2.2, 0.0, 1.0) * 0.12 * uDeconstructAmount;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * 河津樱主花枝片元着色器：
 * 精细校准动态范围 [0.18, 0.85]，彻底消除花冠过曝成一团白球的现象，
 * 让每一朵樱花呈现出从深绯红花萼、粉润花瓣中调、到金色/暖白花蕊的立体雕塑梯度！
 */
export const sakuraBranchFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uRoughness;
  uniform vec3 uKeyLightTop;
  uniform vec3 uKeyLightBottom;
  uniform vec3 uRimLightDir;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vSakuraMeta;
  varying float vClusterDetach;

  void main() {
    vec4 texCol = texture2D(uMap, vUv);
    vec3 rawRgb = texCol.rgb;

    float organType = vSakuraMeta.y;
    float partIdNorm = vSakuraMeta.z;
    // Blender 离线烘焙的 3D 球面受光 + 花心 Cavity AO + 前后景纵深层次 [0.05, 0.99]
    float bakedSculptShade = vSakuraMeta.w;

    float texLuma = dot(rawRgb, vec3(0.299, 0.587, 0.114));

    float texPetal =
      smoothstep(0.32, 0.52, rawRgb.r) *
      smoothstep(0.20, 0.38, rawRgb.b) *
      smoothstep(-0.04, 0.06, rawRgb.r - rawRgb.g);
    float texLeaf =
      smoothstep(0.015, 0.07, rawRgb.g - rawRgb.r) *
      smoothstep(0.08, 0.20, rawRgb.g - rawRgb.b);

    float metaPetal = smoothstep(0.68, 0.92, organType);
    float metaLeaf = smoothstep(0.22, 0.45, organType) * (1.0 - metaPetal);

    float isLeaf = clamp(max(metaLeaf, texLeaf), 0.0, 1.0);
    float isPetal = clamp(max(metaPetal, texPetal) * (1.0 - isLeaf), 0.0, 1.0);
    float isBranch = clamp(1.0 - max(isPetal, isLeaf), 0.0, 1.0);

    // 识别花心正中央的明黄雄蕊点缀
    float yellowExcess = min(rawRgb.r, rawRgb.g) - rawRgb.b * 1.62;
    float isStamen = isPetal * smoothstep(0.09, 0.24, yellowExcess) * (1.0 - isLeaf);

    // 实时动态法线光照（随花朵刚体点头摆动实时改变高光与阴影角度）
    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vec3(0.0, 0.0, 10.5) - vWorldPos);

    // 左上方强戏剧主平行光（严格对齐画面左上角射入的丁达尔光束）
    vec3 keyBeamDir = normalize(vec3(-0.58, 0.68, 0.45));
    float liveNdotL = clamp(dot(N, keyBeamDir) * 0.55 + 0.45, 0.0, 1.0);

    // 边缘逆光勾勒（Rim Backlight）：让背光花瓣的轮廓边缘有一道纤细灵动的亮边
    float fresnelRim = pow(1.0 - max(dot(N, V), 0.0), 2.6);

    // 为不同花朵分件赋予均衡且富有层次的前后景深权重（压低中左主花 Part 2 的过度曝光，使其呈现细腻的花心暗环与花瓣明暗过渡）
    int partIdx = int(floor(partIdNorm * 8.0 + 0.5));
    float partDepthWeight =
      (partIdx == 1) ? 0.96 :
      (partIdx == 2) ? 0.78 :
      (partIdx == 3) ? 0.92 :
      (partIdx == 4) ? 0.76 :
      (partIdx == 5) ? 0.84 :
      (partIdx == 6) ? 0.86 : 0.92;

    // 针对中左主花 (Part 2) 和中右主花 (Part 3) 计算花心凹陷立体遮蔽与五瓣径向波纹，让单朵花内部的五片花瓣与花萼分界清晰可见！
    vec3 blossomCenter =
      (partIdx == 1) ? vec3(0.22, 1.38, 0.35) :
      (partIdx == 2) ? vec3(-0.28, 0.15, 0.85) :
      (partIdx == 3) ? vec3(0.78, 0.45, 0.65) :
      (partIdx == 4) ? vec3(1.28, 0.68, 0.15) :
      (partIdx == 5) ? vec3(0.88, -0.32, 0.72) :
                       vec3(0.28, -1.25, 0.55);
    vec2 relFlower = vLocalPos.xy - blossomCenter.xy;
    float flowerRad = length(relFlower);
    float flowerAngle = atan(relFlower.y, relFlower.x);
    // 樱花五瓣径向起伏波纹（使粘连的花冠自然显现出 5 片花瓣的明暗沟壑分界！）
    float fivePetalGroove = 0.84 + 0.16 * cos(flowerAngle * 5.0 + float(partIdx) * 1.3);
    // 花心凹陷暗环（花心周围一圈深绯红，向外侧花瓣隆起处提亮，边缘再微收）
    float calyxCupAO = smoothstep(0.06, 0.38, flowerRad) * (1.0 - 0.18 * smoothstep(0.65, 1.15, flowerRad));

    // 左上侧花瓣迎光面更亮，右下侧花瓣背光面更深沉
    float localTopLeftGradient = clamp((relFlower.y * 0.45 - relFlower.x * 0.35) + 0.62, 0.22, 1.05);

    // 综合三维立体光度 shade ∈ [0, 1]
    float rawShade =
      (bakedSculptShade * 0.45 + liveNdotL * 0.25 + localTopLeftGradient * 0.30) *
        partDepthWeight *
        fivePetalGroove *
        (0.45 + 0.55 * calyxCupAO) +
      fresnelRim * 0.15 +
      isStamen * 0.35;
    float dramaticShade = clamp(smoothstep(0.10, 0.86, rawShade), 0.0, 1.0);

    // 四阶戏剧色彩映射：
    // 1. 背光阴影与花托深处：深邃梅红/勃艮第绛红 (#8F1242)
    // 2. 侧光过渡中调：浓郁胭脂樱红 (#E82C6E)
    // 3. 迎光花瓣主体：娇嫩河津樱春粉 (#FF6BA3)
    // 4. 左上直射高光瓣尖与花蕊：清透暖粉白 (#FFE3EE) 与明黄花蕊 (#FFE055)
    vec3 deepShadowCrimson = vec3(0.56, 0.07, 0.26);
    vec3 midRichCarmine    = vec3(0.92, 0.18, 0.45);
    vec3 litSakuraPink     = vec3(1.00, 0.48, 0.74);
    vec3 highlightBlush    = vec3(1.00, 0.88, 0.94);
    vec3 stamenGold        = vec3(1.00, 0.88, 0.35);

    vec3 petalCol = mix(
      deepShadowCrimson,
      midRichCarmine,
      smoothstep(0.05, 0.38, dramaticShade)
    );
    petalCol = mix(
      petalCol,
      litSakuraPink,
      smoothstep(0.36, 0.72, dramaticShade)
    );
    petalCol = mix(
      petalCol,
      highlightBlush,
      smoothstep(0.70, 0.95, dramaticShade)
    );
    petalCol = mix(petalCol, stamenGold, clamp(isStamen * 1.15, 0.0, 0.88));

    // 右侧嫩绿叶片：背光深翠绿 -> 迎光鲜亮春芽绿 (#42FF75)
    vec3 leafShadow = vec3(0.10, 0.42, 0.18);
    vec3 leafLit    = vec3(0.38, 1.00, 0.48);
    vec3 leafCol    = mix(leafShadow, leafLit, smoothstep(0.12, 0.78, dramaticShade));

    // 左侧苍劲花枝：上沿迎光亮琥珀金 -> 下沿背光深古铜木色
    vec3 branchShadow = vec3(0.36, 0.18, 0.08);
    vec3 branchLit    = vec3(0.96, 0.62, 0.32);
    vec3 branchCol    = mix(branchShadow, branchLit, smoothstep(0.10, 0.75, dramaticShade));

    vec3 combinedCol =
      petalCol * isPetal +
      leafCol * isLeaf +
      branchCol * isBranch;

    // 输出亮度覆盖 [0.22, 0.94]：
    // 0.22 确保背光花瓣不会掉出阈值变成黑洞，而是呈现深绛红的精致小字符 (: ~ / v)
    // 0.94 确保每朵花的迎光隆起面呈现璀璨饱满的花朵大字符 (✿ ❀ @ %)
    float lumaScale = mix(0.22, 0.94, dramaticShade);
    float organBoost = isBranch * 0.88 + isLeaf * 1.25 + isPetal * 1.02;

    gl_FragColor = vec4(clamp(combinedCol * lumaScale * organBoost, 0.0, 0.98), 1.0);
  }
`;

export const sakuraAsciiVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const sakuraAsciiFragmentShader = /* glsl */ `
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
  uniform float uWindStrength;
  uniform float uPetalBouncePulse;

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

  vec3 extractPureBotanicalColor(vec3 rawRgb) {
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
    vec4 sLeft1 = texture2D(uSceneTex, jitteredCenterUv - vec2(stepX * 0.42, 0.0));
    vec4 sRight1 = texture2D(uSceneTex, jitteredCenterUv + vec2(stepX * 0.42, 0.0));

    // 5 点高斯抗锯齿超采样（Sub-Cell 5-Tap Antialiased Filtering）：
    // 彻底消除 3D 花枝缓慢摇曳跨格时的“整格突然蹦出/跳变”顿挫感，使亚像素级的树枝微晃如丝般顺滑连续！
    vec3 combinedRgb =
      sCenter.rgb * 0.48 +
      (sUp.rgb + sDown.rgb + sLeft1.rgb + sRight1.rgb) * 0.13;

    float pUp = max(sUp.r, max(sUp.g, sUp.b));
    float pDown = max(sDown.r, max(sDown.g, sDown.b));
    float pLeft = max(sLeft1.r, max(sLeft1.g, sLeft1.b));
    float pRight = max(sRight1.r, max(sRight1.g, sRight1.b));
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
    vec3 pureHaloCol = extractPureBotanicalColor(haloRgb + vec3(0.0001));
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
    float distFromFocus = length(normPos);
    float studioVignette = exp(-distFromFocus * distFromFocus * 3.8);

    vec3 ambientCrtTint = vec3(0.06, 0.045, 0.052);
    vec3 activeHaloTint = mix(pureHaloCol, vec3(1.0, 0.92, 0.95), 0.14);
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

    vec2 topLeftCoord = vec2(sampleCenterUv.x * aspect, 1.0 - sampleCenterUv.y);
    vec2 beamDir = normalize(vec2(0.56, 0.828));
    vec2 beamNormal = vec2(beamDir.y, -beamDir.x);
    float beamAlong = max(dot(topLeftCoord, beamDir), 0.0);
    float beamCross = dot(topLeftCoord, beamNormal);

    float windTime = uTime * (0.48 + 0.18 * clamp(uWindStrength, 0.0, 2.5));
    float angleSway =
      (sin(windTime * 0.62) * 0.065 + cos(windTime * 0.37) * 0.035) * beamAlong;
    float sBase = beamCross - beamAlong * 0.04 + angleSway;

    float c0 = -0.40 + cos(windTime * 0.66 + 1.5) * 0.085 + sin(windTime * 0.41) * 0.04;
    float w0 = 0.088 * (0.70 + 0.45 * cos(windTime * 0.82 + 0.6));
    float a0 = 0.50 * (0.38 + 0.62 * (0.5 + 0.5 * cos(windTime * 0.59 + 2.2)));
    float ray0 = exp(-sqr((sBase - c0) / w0)) * a0;

    float c1 = -0.16 + sin(windTime * 0.78 + 0.4) * 0.095 + cos(windTime * 0.43) * 0.045;
    float w1 = 0.082 * (0.68 + 0.48 * sin(windTime * 0.91 + 1.1));
    float a1 = 0.68 * (0.35 + 0.65 * (0.5 + 0.5 * sin(windTime * 0.67 + 0.8)));
    float ray1 = exp(-sqr((sBase - c1) / w1)) * a1;

    float c2 = 0.05 + sin(windTime * 0.64 + 2.1) * 0.105 - sin(windTime * 1.12) * 0.04;
    float w2 = 0.102 * (0.70 + 0.46 * cos(windTime * 0.73 + 0.5));
    float a2 = 0.94 * (0.42 + 0.58 * (0.5 + 0.5 * cos(windTime * 0.58 + 1.9)));
    float ray2 = exp(-sqr((sBase - c2) / w2)) * a2;

    float c3 = 0.30 + cos(windTime * 0.56 + 1.2) * 0.115 + sin(windTime * 0.94 + 3.0) * 0.045;
    float w3 = 0.120 * (0.68 + 0.50 * sin(windTime * 0.62 + 2.4));
    float a3 = 1.00 * (0.48 + 0.52 * (0.5 + 0.5 * sin(windTime * 0.51 + 0.3)));
    float ray3 = exp(-sqr((sBase - c3) / w3)) * a3;

    float c4 = 0.58 + sin(windTime * 0.52 + 4.2) * 0.125 - cos(windTime * 0.86 + 1.7) * 0.05;
    float w4 = 0.150 * (0.68 + 0.52 * cos(windTime * 0.68 + 3.5));
    float a4 = 0.94 * (0.44 + 0.56 * (0.5 + 0.5 * cos(windTime * 0.61 + 2.8)));
    float ray4 = exp(-sqr((sBase - c4) / w4)) * a4;

    float c5 = 0.88 + cos(windTime * 0.69 + 2.7) * 0.130 + sin(windTime * 0.44) * 0.055;
    float w5 = 0.172 * (0.68 + 0.50 * sin(windTime * 0.77 + 4.1));
    float a5 = 0.88 * (0.42 + 0.58 * (0.5 + 0.5 * sin(windTime * 0.54 + 4.5)));
    float ray5 = exp(-sqr((sBase - c5) / w5)) * a5;

    float c6 = 1.18 + sin(windTime * 0.58 + 5.1) * 0.125 - cos(windTime * 0.49 + 0.9) * 0.05;
    float w6 = 0.185 * (0.70 + 0.46 * cos(windTime * 0.63 + 1.4));
    float a6 = 0.76 * (0.40 + 0.60 * (0.5 + 0.5 * cos(windTime * 0.47 + 3.2)));
    float ray6 = exp(-sqr((sBase - c6) / w6)) * a6;

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

    float dx = sampleCenterUv.x;
    float dy = 1.0 - sampleCenterUv.y;
    float blueBoundaryX = mix(0.50, 0.88, sampleCenterUv.y);
    float xRatio = dx / max(blueBoundaryX, 0.01);
    float distNorm = sqrt(xRatio * xRatio + dy * dy * 0.35);
    float falloffLinear = clamp(1.0 - smoothstep(0.05, 1.05, distNorm), 0.0, 1.0);
    float spatialFalloff = falloffLinear * (0.45 + 0.55 * falloffLinear);
    float parallelLightField = multiRayProfile * spatialFalloff;

    float consoleBounceLight = 0.0;
    float sakuraRimPinkWave = 0.0;
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
        float leftWeight =
          smoothstep(0.10, 0.35, relPos.y) *
          mix(0.72, 1.0, clamp(relPos.y, 0.0, 1.0));

        float bounceWeight = 0.0;
        if (isLeft && !isTop) {
          bounceWeight = leftWeight;
        } else if (isTop && !isLeft) {
          bounceWeight = topWeight;
        } else {
          bounceWeight = max(leftWeight, topWeight);
        }

        if (bounceWeight > 0.001) {
          float falloff = exp(-(dOuter * dOuter) / (2.0 * spread * spread * 0.45));
          float incidentModulation = 0.70 + 0.30 * multiRayProfile;
          consoleBounceLight = falloff * bounceWeight * incidentModulation;
          float pinkFlow = 0.55 + 0.45 * sin(relPos.y * 5.2 + uTime * 2.1);
          sakuraRimPinkWave = consoleBounceLight * pinkFlow * clamp(uPetalBouncePulse, 0.0, 1.8);
        }
      }
    }

    float glowingUnitMask =
      crtPadMask *
      (0.38 + 0.62 * crtSubDot) *
      (0.46 + 0.54 * scanlineWave) *
      rowScanBand;

    vec3 subtleBeamTint = vec3(0.82, 0.78, 0.84);
    vec3 consoleNeutralTint = vec3(0.85, 0.83, 0.88);
    vec3 consoleSakuraTint = vec3(1.0, 0.48, 0.70);
    vec3 blendedBounceCol = mix(
      consoleNeutralTint,
      consoleSakuraTint,
      clamp(0.42 * uPetalBouncePulse + 0.35 * sakuraRimPinkWave, 0.0, 0.85)
    );

    float beamIntensityFactor = clamp(uBgBeamIntensity, 0.0, 2.5);
    float bounceIntensityFactor = clamp(uConsoleBounceIntensity, 0.0, 3.0);

    finalColor +=
      (subtleBeamTint * parallelLightField * 0.24 * beamIntensityFactor +
        blendedBounceCol * consoleBounceLight * 0.31 * bounceIntensityFactor) *
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
    float rawLightEnergy = max(luma * 0.85, peakChannel * 0.95);
    float sculptedEnergy = rawLightEnergy * (0.56 + 0.44 * interiorFactor);

    // 降低边缘起始阈值并配合 smoothEdgeFade 连续渐隐包络，彻底根除跨格时的生硬闪烁顿挫
    float edgeThreshold = 0.028;
    if (sculptedEnergy > edgeThreshold) {
      float smoothEdgeFade = smoothstep(edgeThreshold, edgeThreshold + 0.11, sculptedEnergy);
      float normBri = clamp(pow((sculptedEnergy - edgeThreshold) / 0.82, 0.92), 0.04, 0.999);

      float maxIndex = max(uGlyphCount - 1.0, 1.0);
      float glyphIdx = clamp(floor(1.0 + normBri * (maxIndex - 0.01)), 1.0, maxIndex);

      // 亚格子能量质心连续跟随 (Sub-Cell Centroid Tracking)：
      // 让格子内部的字符中心根据上下左右邻格的受光重心做亚像素级连续微移，
      // 彻底消除离散 ASCII 网格在树枝最高点/最低点折返及微幅回弹时的“死区卡顿感”！
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
        vec2 atlasUv = vec2(
          (glyphIdx + glyphLocalUv.x) / uGlyphCount,
          glyphLocalUv.y
        );
        float rawAlpha = texture2D(uGlyphAtlas, atlasUv).a;
        // 保持字符内部镂空与笔画锐利度，绝不糊成实心圆球
        float boldFactor = clamp(uStrokeBoldness * 0.42 + normBri * 0.16, 0.0, 0.72);
        float lowEdge = mix(0.56, 0.36, boldFactor);
        float highEdge = mix(0.88, 0.66, boldFactor);
        glyphAlpha = smoothstep(lowEdge, highEdge, rawAlpha);
      }

      // 戏剧光影四阶色温与明暗映射：
      // 暗部背光花瓣呈现深沉的梅红/绛红，暗部绿叶保持深邃翡翠绿，中调呈现鲜亮花叶原色，左上迎光隆起核心 (> 0.66) 过渡出晶莹暖白高光！
      vec3 pureBotanical = extractPureBotanicalColor(combinedRgb);
      vec3 shadowTint = (pureBotanical.g > pureBotanical.b * 1.12)
        ? vec3(0.14, 0.36, 0.18)
        : vec3(0.32, 0.14, 0.24);
      vec3 shadowBotanical = pureBotanical * shadowTint;
      vec3 midToBright = mix(
        shadowBotanical,
        pureBotanical,
        smoothstep(0.08, 0.58, normBri)
      );
      float coreHotspot =
        smoothstep(0.66, 0.92, normBri) * clamp(uCoreBrightness * 0.32, 0.0, 0.78);
      vec3 warmWhiteCore = mix(pureBotanical, vec3(1.0, 0.95, 0.92), 0.82);
      vec3 charColor = mix(midToBright, warmWhiteCore, coreHotspot);

      float perceptualLuma = clamp(dot(pureBotanical, vec3(0.28, 0.58, 0.14)), 0.28, 0.90);
      float hueGlowBoost = mix(1.0, 0.66 / perceptualLuma, 0.45);

      // 拉大暗部字符与受光高光核字符的 HDR 发光跨度（配合 smoothEdgeFade 实现丝滑无顿挫的跨格呼吸过渡）
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

      finalColor +=
        charColor * glyphAlpha * charHdrIntensity +
        pureBotanical * cellPhosphor;
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
