import { createBotanicalGlyphAtlas } from "./sakuraAsciiShaders";

export { createBotanicalGlyphAtlas };

/**
 * 「数字永生与熵增 · 赛博枯荣循环 (Cybernetic Vanitas)」顶点着色器：
 * 驱动单株扫描植物经历完整的四季生命周期：
 * 1. 春·星尘凝聚与测地线生长 (uGrowthProgress: 0 -> 1)：从星尘涡流向枝干骨架内聚，沿根部向花冠层层绽放
 * 2. 夏·盛放沐光与长尾阻尼微风 (uBranchSpringAngles)：柔韧长枝条围绕中立位持续阻尼微晃
 * 3. 秋冬·由外向内熵增风化与反重力升腾 (uEntropyDecay: 0 -> 1)：花瓣按 64 个晶格簇由外向内剥离、随螺旋上升气流化作星尘消散
 */
export const vanitasBranchVertexShader = /* glsl */ `
  attribute vec4 _sakura_meta;

  uniform float uTime;
  uniform float uWindStrength;
  uniform float uGrowthProgress;
  uniform float uEntropyDecay;
  uniform float uEntropyIntensity;
  uniform vec3 uBranchSpringAngles;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vSakuraMeta;
  varying float vGenesisPulse;
  varying float vErodeFactor;
  varying float vVisibilityMask;

  float hash11(float p) {
    return fract(sin(p * 127.1 + 311.7) * 437.585453);
  }

  vec2 rotate2D(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    vUv = uv;
    vSakuraMeta = _sakura_meta;
    vLocalPos = position;

    float rawGeodesic = _sakura_meta.x;
    float organType = _sakura_meta.y;
    float clusterId = _sakura_meta.z;

    vec3 pos = position;
    vec3 norm = normalize(normal);

    // 融合空间水平跨度与烘焙测地线，确保生长严格从左端根部 (0.0) 推进至右端花瓣尖 (1.0)
    float spanNorm = clamp((pos.x + 2.50) / 5.0, 0.0, 1.0);
    float geodesic = clamp(rawGeodesic * 0.65 + spanNorm * 0.35, 0.02, 0.98);
    // 使用连续空间相位替代离散 floor 分块，彻底消除三角形跨晶格撕裂与生硬块状感
    float spatialWave =
      sin(pos.x * 1.65 + pos.y * 1.35) * 0.5 +
      cos(pos.y * 2.10 - pos.z * 1.45) * 0.5;
    float organicSeed = clamp(0.5 + 0.32 * spatialWave + 0.18 * (clusterId - 0.5), 0.0, 1.0);

    // =========================================================================
    // Phase I: 春 · 星尘内聚与测地线生长绽放 (Genesis & Geodesic Bloom)
    // =========================================================================
    float growthFront = uGrowthProgress * 1.32 - 0.14;
    float localGrowth = smoothstep(geodesic - 0.26, geodesic + 0.05, growthFront);

    // 生长前沿的生物电创生高光脉冲环
    float distToGrowthFront = abs(growthFront - geodesic);
    vGenesisPulse =
      exp(-distToGrowthFront * distToGrowthFront * 42.0) *
      smoothstep(0.02, 0.15, uGrowthProgress) *
      (1.0 - smoothstep(0.88, 1.0, uGrowthProgress));

    // 未完全成形前，顶点沿丝滑的 S 形流线轻柔舒展就位
    if (localGrowth < 0.999) {
      float preMist = pow(1.0 - localGrowth, 1.35);
      float ribbonPhase = uTime * 1.35 + pos.x * 1.2 + pos.y * 0.9;
      vec3 silkInflow = vec3(
        -0.45 * preMist + sin(ribbonPhase) * 0.28 * preMist,
        0.38 * preMist + cos(ribbonPhase * 0.85) * 0.24 * preMist,
        sin(ribbonPhase * 1.25) * 0.22 * preMist
      );
      pos = mix(pos * 0.72 + silkInflow, pos, smoothstep(0.0, 1.0, localGrowth));
    }

    // =========================================================================
    // Phase II: 夏 · 长杆子长尾阻尼微风摆动 (Long-Tail Rod Sway)
    // =========================================================================
    vec2 farTrunkPivot = vec2(-5.50, 0.35);
    float rodAngleXY = mix(
      uBranchSpringAngles.x * 0.85,
      uBranchSpringAngles.x * 0.55 + uBranchSpringAngles.y * 0.65,
      smoothstep(0.0, 1.0, spanNorm)
    );
    float rodAngleXZ = uBranchSpringAngles.z * (0.82 + 0.18 * spanNorm);

    pos.xy = farTrunkPivot + rotate2D(pos.xy - farTrunkPivot, rodAngleXY);
    norm.xy = rotate2D(norm.xy, rodAngleXY);
    pos.xz = vec2(farTrunkPivot.x, 0.0) + rotate2D(pos.xz - vec2(farTrunkPivot.x, 0.0), rodAngleXZ);
    norm.xz = rotate2D(norm.xz, rodAngleXZ);

    // =========================================================================
    // Phase III & IV: 秋冬 · 丝绸卷曲羽化与星尘消散 (Ethereal Silk Curl & Dissolution)
    // =========================================================================
    // 风化从最外缘的花瓣 (geodesic ≈ 1.0) 率先启动，沿着连续波前向内层推进
    float erodeOrder = (1.0 - geodesic) * 0.78 + organicSeed * 0.22;
    float erodeFront = uEntropyDecay * 1.36 - 0.08;
    float localErode = smoothstep(erodeOrder - 0.24, erodeOrder + 0.14, erodeFront);
    vErodeFactor = localErode;

    if (localErode > 0.001) {
      // 柔和的 S 形微风卷边升力：让即将羽化消散的花瓣边缘像轻纱在风中微微上扬卷曲，绝不整块生硬平移
      float curlStrength = pow(localErode, 1.6) * clamp(uEntropyIntensity, 0.2, 2.2);
      float breezePhase = uTime * 1.65 - pos.x * 1.35 + pos.y * 1.15;
      vec3 silkBreezeLift = vec3(
        0.52 * curlStrength + sin(breezePhase) * 0.26 * curlStrength,
        0.48 * curlStrength + cos(breezePhase * 0.82) * 0.28 * curlStrength,
        sin(breezePhase * 1.15) * 0.24 * curlStrength
      );
      pos += norm * (0.14 * curlStrength) + silkBreezeLift;
    }

    // 综合可见度掩码：边缘在羽化卷曲中渐次化作稀疏星尘消隐，交由独立飘逸的 3D 涡流粒子接力远飘
    float growthMask = smoothstep(0.02, 0.30, localGrowth);
    float erodeFadeOut = 1.0 - smoothstep(0.58, 0.96, localErode);
    vVisibilityMask = growthMask * erodeFadeOut;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * norm);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

/**
 * 「数字永生与熵增 · 赛博枯荣循环 (Cybernetic Vanitas)」片元着色器：
 * - 支持三大轮回物种的专属四阶戏剧光影色板 (uSpeciesId: 0=河津樱, 1=山杜鹃, 2=大紫杜鹃)
 * - 春季生长前沿激发璀璨的生物电暖白/青蓝创生脉冲 (vGenesisPulse)
 * - 秋季风化剥离时，花瓣边缘从鲜活原色蜕变为流光余烬金 (#FFBA52) 与赛博星尘紫 (#6A5ACD)
 */
export const vanitasBranchFragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uRoughness;
  uniform int uSpeciesId;
  uniform float uGenesisGlow;
  uniform vec3 uKeyLightTop;
  uniform vec3 uKeyLightBottom;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec4 vSakuraMeta;
  varying float vGenesisPulse;
  varying float vErodeFactor;
  varying float vVisibilityMask;

  void main() {
    if (vVisibilityMask <= 0.01) {
      discard;
    }

    vec4 texCol = texture2D(uMap, vUv);
    // 将硬件 SRGBColorSpace 线性化后的贴图还原回感知均匀的 sRGB 色彩空间，
    // 100% 恢复杜鹃与樱花原贴图鲜艳的花瓣色彩、花心蜜导斑点与底部翠绿叶片纹理！
    vec3 rawRgb = pow(max(texCol.rgb, vec3(0.0001)), vec3(1.0 / 2.2));

    float organType = vSakuraMeta.y;
    float bakedSculptShade = vSakuraMeta.w;

    float texLuma = dot(rawRgb, vec3(0.299, 0.587, 0.114));

    // 1. 直接基于还原后的 sRGB 原贴图物理色相识别底部橄榄绿叶片/黄绿花萼 (G > B + 0.035) 与上部花冠
    float texLeaf =
      smoothstep(0.025, 0.11, rawRgb.g - rawRgb.b) *
      smoothstep(0.12, 0.24, rawRgb.g) *
      (1.0 - smoothstep(0.46, 0.62, rawRgb.r));
    float texPetal =
      smoothstep(0.35, 0.52, rawRgb.r) *
      smoothstep(0.06, 0.18, rawRgb.r - rawRgb.g) *
      (1.0 - texLeaf);

    float metaPetal = smoothstep(0.68, 0.92, organType);
    float metaLeaf = smoothstep(0.22, 0.45, organType) * (1.0 - metaPetal);

    // 优先信任 1024x1024 高清贴图的像素级色彩边界，使底部绿叶、中心黄绿花萼与上部花瓣分界 100% 锐利清晰！
    float isLeaf = clamp(max(texLeaf, metaLeaf * 0.8), 0.0, 1.0);
    float isPetal = clamp(max(texPetal, metaPetal * 0.7) * (1.0 - isLeaf), 0.0, 1.0);
    float isBranch = clamp(1.0 - max(isPetal, isLeaf), 0.0, 1.0);

    vec3 N = normalize(vWorldNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vec3(0.0, 0.0, 10.5) - vWorldPos);

    vec3 keyBeamDir = normalize(vec3(-0.58, 0.68, 0.45));
    float liveNdotL = clamp(dot(N, keyBeamDir) * 0.55 + 0.45, 0.0, 1.0);
    float fresnelRim = pow(1.0 - max(dot(N, V), 0.0), 2.5);

    // 2. 针对摄影测量贴图的真实 sRGB 亮度区间 [0.36, 0.71] 做高对比度还原，结合 Blender 烘焙的三维解剖浮雕光度 (safeBakedShade)，
    // 完整保留三朵花瓣交界处的深色遮蔽缝隙、花心深邃漏斗、深红蜜导斑点与底部翠绿叶片层次！
    float texDetailContrast = pow(smoothstep(0.36, 0.71, texLuma), 1.25);
    float safeBakedShade = bakedSculptShade > 0.02 ? bakedSculptShade : liveNdotL;

    float rawShade =
      texDetailContrast * 0.46 +
      safeBakedShade * 0.40 +
      liveNdotL * 0.14 +
      fresnelRim * 0.10;
    float dramaticShade = clamp(smoothstep(0.06, 0.84, rawShade), 0.0, 1.0);

    // 3. 提纯并增强原贴图真实 RGB 色相（保留贴图原本的洋红/朱红/樱粉与翠绿叶色，绝不抹除贴图细节）
    float maxCh = max(rawRgb.r, max(rawRgb.g, rawRgb.b));
    vec3 normTexCol = maxCh > 0.01 ? (rawRgb / maxCh) : vec3(0.8, 0.4, 0.6);
    float avgCh = (normTexCol.r + normTexCol.g + normTexCol.b) / 3.0;
    vec3 vividTexCol = clamp(mix(vec3(avgCh), normTexCol, 1.55), 0.0, 1.0);

    // 三大物种戏剧光影分级与原贴图色彩深度融合
    vec3 shadowCol;
    vec3 midCol;
    vec3 litCol;
    vec3 highCol;

    if (uSpeciesId == 1) {
      // Specimen #02: 山杜鹃 (Rhododendron kaempferi) — 深褐红花心斑点 -> 朱砂红 -> 珊瑚橙红 -> 暖金高光
      shadowCol = vec3(0.42, 0.05, 0.03);
      midCol    = vec3(0.92, 0.22, 0.12);
      litCol    = vec3(1.00, 0.46, 0.24);
      highCol   = vec3(1.00, 0.86, 0.66);
    } else if (uSpeciesId == 2) {
      // Specimen #03: 大紫杜鹃 (Rhododendron x pulchrum) — 深紫红花喉褶皱 -> 艳丽紫罗兰洋红 -> 亮兰紫粉 -> 柔粉白高光
      shadowCol = vec3(0.38, 0.05, 0.28);
      midCol    = vec3(0.86, 0.18, 0.62);
      litCol    = vec3(1.00, 0.44, 0.82);
      highCol   = vec3(0.98, 0.86, 1.00);
    } else {
      // Specimen #01: 河津樱 (Prunus lannesiana)
      shadowCol = vec3(0.56, 0.07, 0.26);
      midCol    = vec3(0.92, 0.18, 0.45);
      litCol    = vec3(1.00, 0.48, 0.74);
      highCol   = vec3(1.00, 0.88, 0.94);
    }

    vec3 gradedPetal = mix(shadowCol, midCol, smoothstep(0.05, 0.38, dramaticShade));
    gradedPetal = mix(gradedPetal, litCol, smoothstep(0.36, 0.72, dramaticShade));
    gradedPetal = mix(gradedPetal, highCol, smoothstep(0.72, 0.96, dramaticShade));
    // 55% 原贴图真实提纯色彩 + 45% 四阶戏剧光影色板，既有贴图真实细节又极具艺术张力
    vec3 petalCol = mix(gradedPetal, vividTexCol * (0.35 + 0.75 * dramaticShade), 0.52);

    // 底部绿叶与中心嫩黄绿花萼：保留贴图真实的深浅叶绿层次
    vec3 leafCol = mix(
      vec3(0.08, 0.36, 0.14),
      mix(vec3(0.32, 0.96, 0.42), vividTexCol * vec3(0.65, 1.15, 0.55), 0.45),
      smoothstep(0.10, 0.76, dramaticShade)
    );
    vec3 branchCol = mix(
      vec3(0.34, 0.18, 0.08),
      vec3(0.92, 0.58, 0.30),
      smoothstep(0.10, 0.75, dramaticShade)
    );

    vec3 baseCol =
      petalCol * isPetal +
      leafCol * isLeaf +
      branchCol * isBranch;

    // 拉大贴图暗部缝隙 (0.14) 与花瓣受光面 (0.94) 的明暗跨度，使三朵杜鹃花的轮廓与底部叶片层次分明！
    float lumaScale = mix(0.14, 0.94, dramaticShade);
    float organBoost = isBranch * 0.85 + isLeaf * 1.15 + isPetal * 1.02;
    vec3 finalRgb = baseCol * lumaScale * organBoost;

    // 叠加春季生长前沿的生物电创生高光环 (Genesis Bio-Luminescence Pulse)
    vec3 genesisTint =
      (uSpeciesId == 1) ? vec3(1.0, 0.88, 0.45) :
      (uSpeciesId == 2) ? vec3(0.55, 0.92, 1.0) :
                          vec3(1.0, 0.82, 0.92);
    finalRgb += genesisTint * vGenesisPulse * 0.78 * uGenesisGlow;

    // 叠加秋冬熵增风化剥离时的“流光余烬金 -> 赛博星尘蓝紫”色温蜕变与丝滑羽化消融
    float silkMask = vVisibilityMask;
    if (vErodeFactor > 0.01) {
      // 连续空间干涉波模拟边缘化作细碎星尘颗粒渐次飘散，消除整片硬切消隐
      float dustRipple =
        0.5 +
        0.28 * sin(vLocalPos.x * 9.5 + vLocalPos.y * 8.2 - uTime * 3.4) +
        0.22 * cos(vLocalPos.y * 13.0 - vLocalPos.z * 11.0 + uTime * 2.6);
      float atomizeMask = smoothstep(vErodeFactor - 0.32, vErodeFactor + 0.12, dustRipple * 0.85 + 0.15);
      silkMask *= mix(1.0, atomizeMask, smoothstep(0.18, 0.72, vErodeFactor));

      vec3 emberGold = vec3(1.0, 0.76, 0.34);
      vec3 stardustViolet = vec3(0.56, 0.62, 1.0);
      vec3 decayTint = mix(
        emberGold,
        stardustViolet,
        smoothstep(0.22, 0.78, vErodeFactor)
      );
      float rimSpark =
        smoothstep(0.04, 0.42, vErodeFactor) *
        (1.0 - smoothstep(0.52, 0.94, vErodeFactor)) *
        (0.65 + 0.35 * dustRipple);
      finalRgb = mix(finalRgb, decayTint * 0.90, smoothstep(0.12, 0.72, vErodeFactor));
      finalRgb += emberGold * rimSpark * 0.52;
    }

    if (silkMask <= 0.015) {
      discard;
    }

    gl_FragColor = vec4(clamp(finalRgb * silkMask, 0.0, 0.98), 1.0);
  }
`;

export {
  sakuraAsciiVertexShader as vanitasAsciiVertexShader,
  sakuraAsciiFragmentShader as vanitasAsciiFragmentShader,
} from "./sakuraAsciiShaders";
