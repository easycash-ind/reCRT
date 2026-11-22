/**
 * 蝴蝶花 (Iris japonica) 全息薄膜干涉与单向丝滑等高流线着色器
 * - _iris_meta 四通道顶点属性：
 *   R: geodesicDist [0.0 花茎底端 -> 1.0 花瓣/流苏尖端]
 *   G: organType [0.00 花茎/苞片, 0.45 花被片主体, 0.75 紫斑, 0.88 中央花柱流苏冠, 1.00 橘黄鸡冠状附属物]
 *   B: flowCoord [0.0 -> 1.0 花瓣横向/方位流线坐标]
 *   A: thicknessWeight [0.05 -> 0.99 曲率脊线与光学薄膜厚度]
 */

export const crestedIrisHoloVertexShader = /* glsl */ `
  attribute vec4 _iris_meta;

  uniform float uTime;
  uniform vec3 uPointerWorld;
  uniform float uPointerEnergy;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vIrisMeta;
  varying float vPointerWave;

  vec2 rotate2D(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    vUv = uv;
    vIrisMeta = _iris_meta;
    vLocalPos = position;

    float geodesicDist = _iris_meta.x;
    float organType = _iris_meta.y;
    float ridgeWeight = _iris_meta.w;

    vec3 pos = position;
    vec3 norm = normalize(normal);

    vec2 stemPivot = vec2(-0.06, -2.45);
    float swayFactor = smoothstep(0.04, 0.92, geodesicDist);
    float swayXY =
      (sin(uTime * 0.62) * 0.012 + cos(uTime * 0.39 + 1.1) * 0.008) * swayFactor;
    float swayXZ =
      sin(uTime * 0.48 + 0.5) * 0.010 * swayFactor;

    pos.xy = stemPivot + rotate2D(pos.xy - stemPivot, swayXY);
    norm.xy = rotate2D(norm.xy, swayXY);
    pos.xz = rotate2D(pos.xz, swayXZ);
    norm.xz = rotate2D(norm.xz, swayXZ);

    float wavePulse = sin(geodesicDist * 10.0 - uTime * 1.3) * 0.5 + 0.5;
    float petalFlex = smoothstep(0.35, 0.95, geodesicDist) * smoothstep(0.20, 0.55, organType);
    pos += norm * (wavePulse * ridgeWeight * petalFlex * 0.018);

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    float dPtr = length(vWorldPos.xy - uPointerWorld.xy);
    vPointerWave = exp(-dPtr * dPtr * 0.65) * uPointerEnergy;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const crestedIrisHoloFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform sampler2D uBackdropTex;
  uniform vec2 uScreenRes;
  uniform float uUseBackdrop;
  uniform float uFrostBlur;
  uniform float uTime;
  uniform float uSparkTime;
  uniform vec3 uCameraPos;
  uniform float uPassOpacity;
  uniform float uPetalOpacity;
  uniform float uContourDensity;
  uniform float uIridescenceStrength;
  uniform float uSpectrumShift;
  uniform float uSparkDensity;
  uniform float uSparkTrailLength;
  uniform float uSparkGlow;
  uniform float uRenderPass; // 0.0 = 仅渲染花茎通道, 1.0 = 仅渲染半透明花冠通道

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vIrisMeta;
  varying float vPointerWave;

  // 高饱和度薄膜干涉色散调色板（电光蓝 -> 冰青 -> 翡翠绿 -> 紫罗兰 -> 品红 -> 琥珀橙）
  vec3 thinFilmSpectralPalette(float phase) {
    vec3 a = vec3(0.36, 0.42, 0.64);
    vec3 b = vec3(0.52, 0.48, 0.50);
    vec3 c = vec3(1.00, 1.00, 1.00);
    vec3 d = vec3(0.06, 0.36, 0.70);
    return clamp(a + b * cos(6.2831853 * (c * phase + d)), 0.0, 1.0);
  }

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  // 缓入 + 接近边缘强缓出减速曲线（起步柔和，中段轻快，快到边缘时明显减速）
  float easeInOutDecel(float t) {
    float c = clamp(t, 0.0, 1.0);
    float smoothS = c * c * (3.0 - 2.0 * c);
    float strongDecel = 1.0 - pow(1.0 - c, 2.85);
    return mix(smoothS, strongDecel, 0.58);
  }

  // 16 点黄金角圆盘磨砂玻璃背景采样（Vogel Disk Frosted Blur + 微观磨砂散射）
  vec3 sampleFrostedBackdrop(vec2 centerUv, vec2 blurRadius, float seed) {
    vec3 acc = vec3(0.0);
    float weightSum = 0.0;
    float baseAngle = seed * 6.2831853;
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 16.0);
      float theta = fi * 2.3999632 + baseAngle;
      vec2 offset = vec2(cos(theta), sin(theta)) * r * blurRadius;
      float w = exp(-r * r * 1.35);
      acc += texture2D(uBackdropTex, clamp(centerUv + offset, 0.002, 0.998)).rgb * w;
      weightSum += w;
    }
    return acc / max(weightSum, 0.001);
  }

  // 单向丝滑自适应抗锯齿等高流线
  float fineAntiAliasedLine(float coord, float frequency, float halfWidth) {
    float scaled = coord * frequency;
    float dist = abs(fract(scaled - 0.5) - 0.5);
    float fw = clamp(fwidth(scaled), 0.002, 0.20);
    return 1.0 - smoothstep(max(halfWidth - fw * 0.65, 0.0), halfWidth + fw * 1.15, dist);
  }

  void main() {
    vec4 texSample = texture2D(uMap, vUv);
    vec3 rawRgb = pow(max(texSample.rgb, vec3(0.0001)), vec3(1.0 / 2.2));
    float texLuma = dot(rawRgb, vec3(0.299, 0.587, 0.114));
    float texDetail = smoothstep(0.18, 0.88, texLuma);
    float texVeinContrast = clamp(1.0 - abs(texDetail - 0.54) * 1.7, 0.0, 1.0);

    float geodesicDist = vIrisMeta.x;
    float thickness = vIrisMeta.w;

    // 纯三维空间深度 (z) 与测地线距离 (geodesicDist) 连续分离花梗/苞片与前垂花瓣：
    // 花梗与左侧苞片完全位于 z ∈ [-0.67, -0.34] 且 geodesicDist < 0.42；
    // 前垂花瓣完全位于前方 z ∈ [+0.80, +2.06] 且 geodesicDist > 0.55。
    // 二者在 3D 空间相距超过 1.1 个单位，过渡完全发生在空气间隙中，彻底杜绝任何锯齿三角面！
    float isStem =
      (1.0 - smoothstep(0.40, 0.47, geodesicDist)) *
      (1.0 - smoothstep(-0.15, 0.25, vLocalPos.z)) *
      (1.0 - smoothstep(-0.16, 0.10, vLocalPos.y));
    isStem = clamp(isStem, 0.0, 1.0);
    float isPetal = 1.0 - isStem;

    // 分通道有序渲染裁剪：Pass 0 先完整绘制花茎，Pass 1 再绘制半透明花瓣覆盖其上
    if (uRenderPass < 0.5 && isStem < 0.02) discard;
    if (uRenderPass >= 0.5 && isStem > 0.98) discard;

    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCameraPos - vWorldPos);
    float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 2.05);
    float sharpRim = pow(1.0 - ndotv, 4.2);

    float depthGrad = length(vec2(dFdx(vWorldPos.z), dFdy(vWorldPos.z)));
    float edgeHighlight = smoothstep(0.014, 0.08, depthGrad);

    vec3 lightKey = normalize(vec3(-0.42, 0.68, 0.60));
    vec3 lightRim = normalize(vec3(0.65, 0.30, -0.70));
    vec3 lightWarm = normalize(vec3(-0.15, -0.45, 0.88));
    vec3 HKey = normalize(lightKey + V);
    vec3 HRim = normalize(lightRim + V);
    vec3 HWarm = normalize(lightWarm + V);
    float ndotl = clamp(dot(N, lightKey) * 0.5 + 0.5, 0.0, 1.0);
    float specKey = pow(max(dot(N, HKey), 0.0), 48.0);
    float specRim = pow(max(dot(N, HRim), 0.0), 22.0);
    float specWarm = pow(max(dot(N, HWarm), 0.0), 26.0);

    // 1. 薄膜光学干涉色散：采用连续正弦谐波相位呼吸，保持电光蓝、冰青、翡翠绿、紫罗兰与品红的丝滑渐变，杜绝色相跳变
    float waveWarp =
      sin(vLocalPos.x * 2.5 + vLocalPos.y * 2.0 + uTime * 0.42) * 0.16 +
      cos(vLocalPos.z * 3.2 - vLocalPos.x * 1.7 - uTime * 0.31) * 0.12;
    float timeBreathPhase =
      sin(uTime * 0.48 + geodesicDist * 2.4) * 0.14 +
      cos(uTime * 0.29 - vLocalPos.x * 1.2) * 0.08;
    float filmPhase =
      (1.0 - ndotv) * 1.32 +
      thickness * 0.84 +
      geodesicDist * 0.52 +
      waveWarp +
      timeBreathPhase +
      uSpectrumShift +
      vPointerWave * 0.22;

    vec3 iridPrimary = thinFilmSpectralPalette(filmPhase);
    vec3 iridAccent = thinFilmSpectralPalette(filmPhase + 0.28 + 0.08 * sin(uTime * 0.37));

    float leftWing = smoothstep(0.10, -1.8, vLocalPos.x);
    float rightWing = smoothstep(-0.10, 1.8, vLocalPos.x);
    vec3 regionalHue = mix(
      vec3(0.14, 0.68, 1.00),
      vec3(0.45, 0.26, 0.98),
      rightWing * 0.72
    );
    regionalHue = mix(
      regionalHue,
      vec3(0.10, 0.92, 0.68),
      leftWing * smoothstep(0.88, 0.22, geodesicDist) * 0.65
    );

    vec3 deepGlassCore = vec3(0.03, 0.06, 0.14) + regionalHue * 0.16;
    float iridMask = clamp(
      (fresnel * 0.84 + smoothstep(0.42, 0.84, thickness) * 0.38 + edgeHighlight * 0.32) *
        uIridescenceStrength,
      0.0,
      1.0
    );
    vec3 petalGlassCol = mix(deepGlassCore, mix(iridPrimary, regionalHue, 0.34), iridMask);

    // 2. 花瓣本征叶脉流线（由花喉/花瓣根部辐射流向花瓣外缘，而非平面水平投影）
    // 以花喉基部 (-0.08, 0.34, 0.18) 为中心，建立与前倾花盘对齐的本征切平面坐标 (diskU, diskV)
    vec3 relCorolla = vLocalPos - vec3(-0.08, 0.34, 0.18);
    float diskU = relCorolla.x;
    float diskV = relCorolla.y * 0.78 - relCorolla.z * 0.62;
    float diskRadius = length(vec2(diskU, diskV));
    float petalTheta = atan(diskV, diskU);

    // 结合花瓣三维曲面法线与曲率厚度产生自然的叶脉弧度偏折（顺应花瓣褶皱起伏）
    float veinCurl =
      (N.x * diskV - N.y * diskU) * 0.42 +
      (thickness - 0.5) * 0.65 +
      sin(geodesicDist * 7.5) * 0.18;

    // 使用整数倍周期的三角波 asin(sin(N * theta + curl))，彻底消除 ±π 极角接缝
    float veinCount = floor(uContourDensity * 24.0 + 0.5);
    float totalPhase = veinCount * petalTheta + veinCurl * 3.2;
    float radialWave = sin(totalPhase);
    float triRadial = asin(clamp(radialWave, -0.9995, 0.9995)) * 0.63661977;
    float fwRadial = clamp(fwidth(triRadial), 0.003, 0.28);
    float radialVeinLine =
      1.0 - smoothstep(max(0.085 - fwRadial * 0.65, 0.0), 0.085 + fwRadial * 1.15, abs(triRadial));

    // 自花喉基部向花瓣边缘渐次展开，使叶脉在花瓣根部柔和起笔、在花翼与边缘清晰舒展
    float rootToEdgeMask =
      smoothstep(0.18, 0.58, diskRadius) *
      smoothstep(0.38, 0.54, geodesicDist) *
      isPetal;
    float striationStrength = radialVeinLine * (0.12 + 0.88 * rootToEdgeMask);

    // --- 第二阶段亮点：从花瓣根部 (petalProgress=0) 沿着每条叶脉条纹向花瓣边缘 (petalProgress=1) 运动，快到边缘时减速并消失 ---
    float petalProgress = clamp((geodesicDist - 0.41) / 0.55, 0.0, 1.0);
    // 每条放射叶脉拥有唯一且在 ±π 处闭合的离散编号 veinId
    float veinId = mod(floor(totalPhase / 3.14159265 + 0.5), 2.0 * veinCount);
    float petalSparkOrb = 0.0;
    float petalSparkTail = 0.0;
    float petalSpawnThreshold = 1.0 - clamp(uSparkDensity, 0.0, 1.0) * 0.85;
    if (uSparkDensity > 0.005) {
      for (int s = 0; s < 2; s++) {
        float slotSeed = veinId * 19.37 + float(s) * 73.13;
        float speedVar = 0.20 + 0.10 * hash11(slotSeed + 1.7);
        float timeShift = hash11(slotSeed + 5.3) * 10.0;
        float rawCycle = uSparkTime * speedVar + timeShift;
        float cycleIdx = floor(rawCycle);
        float cycleFract = fract(rawCycle);

        // 根据 uSparkDensity 控制激活发射亮珠的叶脉数量占比
        float spawnChance = hash11(veinId * 31.7 + cycleIdx * 13.9 + float(s) * 41.1);
        if (spawnChance > petalSpawnThreshold && cycleFract > 0.24) {
          float tp = clamp((cycleFract - 0.24) / 0.76, 0.0, 1.0);
          // 缓入缓出 + 接近花瓣边缘明显减速
          float sparkPos = easeInOutDecel(tp);
          float dSpark = petalProgress - sparkPos;
          // 亮珠核心支持向后非对称光纤拉伸（前端保持圆润，后端随 uSparkTrailLength 拉长）
          float trailScale = max(uSparkTrailLength, 0.0);
          float alongScale = dSpark >= 0.0 ? 12.0 : (12.0 / (1.0 + trailScale * 1.65));
          float orbDist = length(vec2(triRadial * 0.75, dSpark * alongScale));
          float orbCore = exp(-orbDist * orbDist * 16.0);
          float orbHalo = exp(-orbDist * orbDist * 3.8) * 0.42;
          // 沿叶脉中心线向后的流光拉丝尾迹（严格贴合叶脉弯曲走向）
          float maxTailSpan = max(0.24 * trailScale, 0.004);
          float decayLen = max(0.075 * trailScale, 0.002);
          float veinTail =
            exp(dSpark / decayLen) *
            step(dSpark, 0.0) *
            smoothstep(-maxTailSpan, 0.0, dSpark) *
            radialVeinLine *
            0.85 *
            clamp(trailScale, 0.0, 1.8);
          // 刚离开花瓣根部时渐显，快到花瓣边缘减速时柔和消失
          float fadeIn = smoothstep(0.0, 0.10, tp);
          float fadeOut = 1.0 - smoothstep(0.70, 0.98, tp);
          float env = fadeIn * fadeOut;
          petalSparkOrb += (orbCore + orbHalo) * env;
          petalSparkTail += veinTail * env;
        }
      }
    }
    float petalSparkMask =
      clamp((petalSparkOrb + petalSparkTail) * uSparkGlow, 0.0, 3.2) *
      smoothstep(0.01, 0.07, petalProgress) *
      isPetal;

    vec3 striationGlowCol = mix(
      vec3(0.55, 0.88, 1.00),
      iridAccent * 1.25,
      0.58
    );

    // 3. 花翼紫罗兰与品红斑纹内发光
    float texOrange =
      smoothstep(0.32, 0.56, rawRgb.r) *
      smoothstep(0.05, 0.22, rawRgb.r - rawRgb.g) *
      smoothstep(0.06, 0.24, rawRgb.g - rawRgb.b);
    float texViolet =
      smoothstep(0.02, 0.12, rawRgb.b - rawRgb.g) *
      smoothstep(0.01, 0.10, rawRgb.r - rawRgb.g) *
      (1.0 - texOrange);

    vec3 wingMagentaGlow = mix(vec3(0.68, 0.18, 0.92), vec3(1.00, 0.34, 0.74), fresnel);
    petalGlassCol = mix(
      petalGlassCol,
      wingMagentaGlow * (0.55 + 0.45 * ndotl),
      clamp((texViolet * 0.85 + texOrange * 0.65) * smoothstep(0.35, 0.85, abs(vLocalPos.x)), 0.0, 0.78)
    );

    // 4. 花心中央暖橙/珊瑚红鸡冠状花蕊群（对准前倾后的花冠漏斗中心 y ≈ 0.46）
    float centerCupDist = length(vec2(vLocalPos.x * 0.86, (vLocalPos.y - 0.46) * 1.05));
    float inCenterCore =
      smoothstep(0.88, 0.15, centerCupDist) *
      smoothstep(0.05, 0.35, vLocalPos.y) *
      (1.0 - smoothstep(0.88, 1.35, vLocalPos.y)) *
      isPetal;

    float papillae =
      0.55 +
      0.45 * sin(vLocalPos.x * 34.0 + vLocalPos.y * 38.0 + vLocalPos.z * 26.0);
    float stamenCoreMask = clamp(
      inCenterCore * (0.52 + 0.48 * max(texOrange, smoothstep(0.42, 0.82, thickness) * papillae)),
      0.0,
      0.92
    );

    vec3 deepRust  = vec3(0.46, 0.12, 0.04);
    vec3 warmCoral = vec3(0.92, 0.36, 0.12);
    vec3 brightAmber = vec3(1.00, 0.68, 0.26);
    float coreRelief = clamp(ndotl * 0.55 + thickness * 0.45, 0.0, 1.0);
    vec3 stamenCol = mix(deepRust, warmCoral, smoothstep(0.12, 0.62, coreRelief));
    stamenCol = mix(stamenCol, brightAmber, smoothstep(0.58, 0.94, coreRelief) * 0.85);

    // 5. 底部花茎与苞片：拟合花茎三维弯曲中心轴线 (stemAxisX, stemAxisZ)，使维管束条纹严格顺着茎秆弯曲方向延伸并环绕柱面
    float cylRoundness = clamp(N.z * 0.65 + (1.0 - abs(N.x)) * 0.35, 0.0, 1.0);
    float bractBulge = exp(-pow((vLocalPos.y + 1.48) * 1.75, 2.0));
    float stemAxisX =
      mix(0.03, -0.14, smoothstep(-2.85, -0.25, vLocalPos.y)) -
      0.19 * bractBulge;
    float stemAxisZ = -0.46 - 0.07 * bractBulge;

    float stemRelX = vLocalPos.x - stemAxisX;
    float stemRelZ = vLocalPos.z - stemAxisZ;
    // 沿圆柱周向角与横截面弧长分布，使条纹平行于弯曲茎轴并在圆柱侧缘自然透视加密
    float stemCircumCoord =
      atan(stemRelX, max(stemRelZ + 0.28, 0.06)) * 1.85 +
      stemRelX * 3.2 -
      smoothstep(-0.18, -0.48, vLocalPos.x) * (vLocalPos.y + 1.85) * 0.55;
    float stemVein = fineAntiAliasedLine(stemCircumCoord, 4.2, 0.055);

    // --- 第一阶段亮点：从画面外茎的根部 (stemProgress=0) 沿着茎条纹向上运动到花托 (stemProgress=1) ---
    float stemProgress = clamp(geodesicDist / 0.41, 0.0, 1.0);
    float stemScaled = stemCircumCoord * 4.2;
    float stemLaneId = floor(stemScaled + 0.5);
    float stemTransverse = (fract(stemScaled + 0.5) - 0.5) * 2.0;
    float stemSparkOrb = 0.0;
    float stemSparkTail = 0.0;
    float stemSpawnThreshold = 1.0 - clamp(uSparkDensity, 0.0, 1.0) * 0.92;
    if (uSparkDensity > 0.005) {
      for (int k = 0; k < 2; k++) {
        float laneSeed = stemLaneId * 23.41 + float(k) * 59.17;
        float laneSpeed = 0.24 + 0.09 * hash11(laneSeed + 2.3);
        float laneOffset = hash11(laneSeed + 8.1) * 10.0;
        float rawStemCycle = uSparkTime * laneSpeed + laneOffset;
        float stemCycleIdx = floor(rawStemCycle);
        float stemCycleFract = fract(rawStemCycle);

        float laneActive = hash11(stemLaneId * 41.3 + stemCycleIdx * 17.7 + float(k) * 29.3);
        if (laneActive > stemSpawnThreshold && stemCycleFract < 0.68) {
          float ts = clamp(stemCycleFract / 0.68, 0.0, 1.0);
          // 从画面底部外 (-0.06) 沿茎条纹向上缓入缓出移动至花托 (1.02)
          float sparkYPos = mix(-0.06, 1.02, easeInOutDecel(ts));
          float dStemSpark = stemProgress - sparkYPos;
          float sTrailScale = max(uSparkTrailLength, 0.0);
          float sAlongScale = dStemSpark >= 0.0 ? 10.0 : (10.0 / (1.0 + sTrailScale * 1.55));
          float sOrbDist = length(vec2(stemTransverse * 0.68, dStemSpark * sAlongScale));
          float sCore = exp(-sOrbDist * sOrbDist * 15.0);
          float sHalo = exp(-sOrbDist * sOrbDist * 3.5) * 0.45;
          float sMaxTail = max(0.30 * sTrailScale, 0.004);
          float sDecayLen = max(0.09 * sTrailScale, 0.002);
          float sTail =
            exp(dStemSpark / sDecayLen) *
            step(dStemSpark, 0.0) *
            smoothstep(-sMaxTail, 0.0, dStemSpark) *
            stemVein *
            0.85 *
            clamp(sTrailScale, 0.0, 1.8);
          float sFadeIn = smoothstep(0.0, 0.10, ts);
          float sFadeOut = 1.0 - smoothstep(0.80, 1.0, ts);
          float sEnv = sFadeIn * sFadeOut;
          stemSparkOrb += (sCore + sHalo) * sEnv;
          stemSparkTail += sTail * sEnv;
        }
      }
    }
    float stemSparkMask = clamp((stemSparkOrb + stemSparkTail) * uSparkGlow, 0.0, 3.2) * isStem;
    // 识别花梗左侧浅色半透明膜质苞片（贴图亮度较高、绿蓝通道接近）
    float isBractSheath =
      isStem *
      smoothstep(0.38, 0.68, texLuma) *
      smoothstep(-0.18, -0.36, vLocalPos.x);

    vec3 stemDeepShadow = vec3(0.02, 0.075, 0.035);
    vec3 stemMidGreen   = vec3(0.11, 0.35, 0.15);
    vec3 stemSubsurface = vec3(0.30, 0.66, 0.32);
    vec3 bractCeladon   = vec3(0.24, 0.52, 0.36);

    vec3 stemCol = mix(
      stemDeepShadow,
      mix(stemMidGreen, bractCeladon, isBractSheath * 0.65),
      smoothstep(0.08, 0.78, cylRoundness * (0.45 + 0.55 * texDetail))
    );
    stemCol = mix(
      stemCol,
      mix(stemSubsurface, vec3(0.52, 0.82, 0.62), isBractSheath * 0.55),
      (fresnel * 0.52 + stemVein * 0.18) * (0.4 + 0.6 * ndotl)
    );
    // 叠加茎部沿维管束条纹上行的流光亮点（翡翠青白高光）
    stemCol += vec3(0.58, 1.00, 0.82) * stemSparkMask * 0.95;

    // 6. 组合花瓣：深邃玻璃 + 平行等高流线 + 边缘青蓝/品红/暖琥珀高光焦点
    vec3 causticHotspots =
      vec3(0.28, 0.88, 1.00) * specKey * 0.92 +
      vec3(0.88, 0.32, 0.96) * specRim * 0.64 +
      vec3(1.00, 0.54, 0.28) * specWarm * 0.48 * smoothstep(0.2, 0.8, thickness);

    vec3 petalFinal =
      petalGlassCol * (0.56 + 0.44 * ndotl) * (0.78 + 0.22 * texVeinContrast) +
      striationGlowCol * striationStrength * (0.38 + 0.36 * fresnel + 0.25 * vPointerWave) +
      iridPrimary * (fresnel * 0.54 + edgeHighlight * 0.30) +
      causticHotspots +
      vec3(0.65, 0.90, 1.00) * sharpRim * 0.52;

    petalFinal = mix(petalFinal, stamenCol, stamenCoreMask * (1.0 - striationStrength * 0.35));

    // 连续平滑的三角正弦流光波（替代原先会周期性阶跃突变的 fract 函数）
    float smoothWave = 0.5 + 0.5 * sin(geodesicDist * 5.2 - uTime * 1.05 + vLocalPos.x * 0.8);
    float pulseWave = pow(smoothWave, 2.8) * isPetal * (1.0 - inCenterCore * 0.8);
    petalFinal += iridAccent * pulseWave * (0.12 + 0.20 * striationStrength);

    // 叠加花瓣叶脉上由花瓣根向花瓣边缘减速游走的流光亮点（在花根处带暖金光泽，向花瓣边缘渐变为冰青电光白）
    vec3 petalSparkColor = mix(
      vec3(1.00, 0.88, 0.64),
      mix(vec3(0.68, 0.96, 1.00), iridAccent * 1.35 + vec3(0.28), 0.45),
      smoothstep(0.05, 0.65, petalProgress)
    );
    petalFinal += petalSparkColor * petalSparkMask * 1.12;

    vec3 combinedRgb = mix(petalFinal, stemCol, isStem);
    combinedRgb = combinedRgb / (1.0 + combinedRgb * 0.26);

    // 在色调映射之后叠加高亮度 HDR 维管束游走亮珠，触发 Bloom 辉光光晕
    vec3 hdrPetalSpark = mix(
      vec3(1.00, 0.90, 0.68),
      vec3(0.76, 0.98, 1.00),
      smoothstep(0.08, 0.55, petalProgress)
    );
    vec3 hdrStemSpark = vec3(0.68, 1.00, 0.86);
    combinedRgb += hdrPetalSpark * petalSparkMask * 0.88 + hdrStemSpark * stemSparkMask * 0.85;

    float petalAlpha = clamp(
      (0.32 +
        fresnel * 0.50 +
        striationStrength * 0.24 +
        stamenCoreMask * 0.48 +
        specKey * 0.32) *
        uPetalOpacity +
        petalSparkMask * 0.38,
      0.12,
      0.98
    );

    // 若当前为正面花冠磨砂玻璃透射通道 (uUseBackdrop > 0.5)，对后方背景（花茎与背面花瓣）执行法线折射与黄金角磨砂模糊
    if (uUseBackdrop > 0.5 && isPetal > 0.5) {
      vec2 screenUv = gl_FragCoord.xy / max(uScreenRes, vec2(1.0));
      float aspect = uScreenRes.x / max(uScreenRes.y, 1.0);
      // 3D 花瓣曲面法线引起的磨砂玻璃折射偏移
      vec2 normalRefract = N.xy * (0.018 + 0.014 * thickness) * vec2(1.0 / aspect, 1.0) * clamp(uFrostBlur, 0.0, 2.0);
      // 像素级微磨砂颗粒扰动，赋予真实的蚀刻磨砂玻璃触感
      float frostJitter = hash11(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)));
      float blurScale = (0.024 + 0.016 * (1.0 - ndotv) + 0.010 * thickness) * uFrostBlur;
      vec2 blurRadius = vec2(blurScale / aspect, blurScale);

      vec3 blurredBg = sampleFrostedBackdrop(screenUv - normalRefract, blurRadius, frostJitter);
      // 透过磨砂花瓣后，背景光染上一层柔和的花瓣虹彩雾化透射色调
      vec3 frostedTint = mix(vec3(0.82, 0.92, 1.00), regionalHue * 0.85 + vec3(0.35), 0.42);
      vec3 transmittedBackdrop = blurredBg * frostedTint * (1.0 - petalAlpha * 0.52);

      // 合成磨砂模糊背景与花瓣自身表面光学色彩，并以不透明像素写出以替换底下原本锐利的茎秆像素
      vec3 frostedComposite = transmittedBackdrop + combinedRgb * mix(0.72, 1.0, petalAlpha);
      gl_FragColor = vec4(frostedComposite, 1.0);
      return;
    }

    float finalAlpha = mix(petalAlpha, 0.96, isStem) * uPassOpacity;

    gl_FragColor = vec4(combinedRgb, finalAlpha);
  }
`;
