import * as THREE from "three";

/**
 * 全场景共享的相机/车辆前方与后方距离渐显渐隐控制参数
 * 在 [uFadeStart, uFadeEnd] 区间内以 4x4 丝网版画颗粒有序抖动平滑消隐，
 * 既避免半透明深度排序穿帮，又彻底杜绝流式区块与循环实体在远方突然出现/突然消失。
 */
export const CITYPOP_FADE_UNIFORMS = {
  uCarZ: { value: 0 },
  uFadeStart: { value: 460.0 },
  uFadeEnd: { value: 590.0 },
};

/**
 * 全场景共享的昼夜主题过渡 Uniform (0.0 = noon, 1.0 = sunset)
 * 确保 noon 配色 100% 保持原样，同时为 sunset 提供系统性的全场景日落染色配色
 */
export const CITYPOP_THEME_UNIFORMS = {
  uSunset: { value: 0 },
};

export const CITYPOP_FADE_FRAG_SNIPPET = /* glsl */ `
  float _cpDist = abs(vFadeWorldZ - uFadeCarZ);
  if (_cpDist > uFadeStart) {
    float _cpT = clamp((_cpDist - uFadeStart) / max(1.0, uFadeEnd - uFadeStart), 0.0, 1.0);
    vec2 _bp = floor(mod(gl_FragCoord.xy, 4.0));
    float _bx = _bp.x;
    float _by = _bp.y;
    float _bayer = (
      mod(_bx * 2.0 + _by * 3.0, 4.0) * 4.0 +
      mod(_bx + _by * 2.0, 4.0) + 0.5
    ) / 16.0;
    if (_cpT >= _bayer) discard;
  }
`;

/**
 * 为任意 Three.js 材质注入远景丝网颗粒渐显渐隐（链式保留原有 onBeforeCompile）
 */
export function applyCityPopDistanceFade<T extends THREE.Material>(mat: T): T {
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) {
      prevCompile(shader, renderer);
    }
    shader.uniforms.uFadeCarZ = CITYPOP_FADE_UNIFORMS.uCarZ;
    shader.uniforms.uFadeStart = CITYPOP_FADE_UNIFORMS.uFadeStart;
    shader.uniforms.uFadeEnd = CITYPOP_FADE_UNIFORMS.uFadeEnd;

    shader.vertexShader =
      "varying float vFadeWorldZ;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
          #include <begin_vertex>
          vFadeWorldZ = (modelMatrix * vec4(transformed, 1.0)).z;
        `
      );

    shader.fragmentShader =
      "uniform float uFadeCarZ;\nuniform float uFadeStart;\nuniform float uFadeEnd;\nvarying float vFadeWorldZ;\n" +
      shader.fragmentShader.replace(
        "void main() {",
        "void main() {\n" + CITYPOP_FADE_FRAG_SNIPPET
      );
  };
  return mat;
}

let sharedToonGradientMap: THREE.DataTexture | null = null;

/**
 * 生成铃木英人（Eizin Suzuki）式四阶高对比色彩分层贴图 (NearestFilter)
 * 通过明显的冷暖色温跳跃表现立体体积：
 * Band 0 (背光暗部): 深群青/靛蓝冷调暗部 (#243E73)
 * Band 1 (冷反光过渡): 晴空天青色环境反光 (#68B4E8)
 * Band 2 (受光主色): 明亮暖调本色 (#F2EFE9)
 * Band 3 (硬边高光): 纯净阳光高光块 (#FFFFFF)
 */
export function getCityPopGradientMap(): THREE.DataTexture {
  if (sharedToonGradientMap) return sharedToonGradientMap;

  const data = new Uint8Array([
    42, 68, 122, 255,   // Band 0: 深靛蓝冷暗部
    112, 178, 232, 255, // Band 1: 天青蓝反射中暗部（复刻参考图1车体与建筑上的天蓝反光层）
    240, 236, 230, 255, // Band 2: 暖白受光主色面
    255, 255, 255, 255, // Band 3: 纯白硬边高光层
  ]);

  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  sharedToonGradientMap = texture;
  return texture;
}

let sharedUniformOutlineMat: THREE.ShaderMaterial | null = null;

/**
 * 屏幕空间恒定像素宽度（Uniform Screen-Space Width）法线外扩钢笔描边材质
 * 乘以 clipPos.w 抵消透视近大远小与物体自身缩放差异，确保全场景近处车辆与远处建筑拥有完全一致的钢笔线条粗细！
 */
export function getUniformInkOutlineMaterial(): THREE.ShaderMaterial {
  if (sharedUniformOutlineMat) return sharedUniformOutlineMat;

  sharedUniformOutlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uInkColor: { value: new THREE.Color("#10131C") },
      uPixelWidth: { value: 1.65 },
      uFadeCarZ: CITYPOP_FADE_UNIFORMS.uCarZ,
      uFadeStart: CITYPOP_FADE_UNIFORMS.uFadeStart,
      uFadeEnd: CITYPOP_FADE_UNIFORMS.uFadeEnd,
    },
    vertexShader: /* glsl */ `
      uniform float uPixelWidth;
      varying float vFadeWorldZ;
      void main() {
        vFadeWorldZ = (modelMatrix * vec4(position, 1.0)).z;
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 viewNorm = normalize(normalMatrix * normal);
        vec2 offsetDir = length(viewNorm.xy) > 0.0001 ? normalize(viewNorm.xy) : vec2(0.0, 1.0);
        // 按恒定屏幕像素宽度外扩，不受物体缩放或距离影响
        clipPos.xy += offsetDir * (uPixelWidth / vec2(1440.0, 900.0)) * clipPos.w * 2.0;
        // 轻微深度偏移避免与正面网格 Z-fighting
        clipPos.z += 0.0004 * clipPos.w;
        gl_Position = clipPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInkColor;
      uniform float uFadeCarZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying float vFadeWorldZ;
      void main() {
        ${CITYPOP_FADE_FRAG_SNIPPET}
        gl_FragColor = vec4(uInkColor, 1.0);
      }
    `,
  });

  return sharedUniformOutlineMat;
}

/**
 * 创建带 City Pop 赛璐璐色阶的 MeshToonMaterial
 */
export function createCityPopToonMaterial(
  color: string | number,
  options?: {
    emissive?: string | number;
    emissiveIntensity?: number;
    map?: THREE.Texture | null;
    transparent?: boolean;
    opacity?: number;
    side?: THREE.Side;
  }
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getCityPopGradientMap(),
    emissive: options?.emissive ?? 0x000000,
    emissiveIntensity: options?.emissiveIntensity ?? 0,
    map: options?.map ?? null,
    transparent: options?.transparent ?? false,
    opacity: options?.opacity ?? 1,
    side: options?.side ?? THREE.FrontSide,
  });
}

let roadTexCache: THREE.CanvasTexture | null = null;

/**
 * 生成铃木英人（Eizin Suzuki）参考图 1 & 2 风格石版画砂砾沥青路面贴图
 * 核心质感还原：
 * 1. 暖米白/浅粉灰阳光沥青基底 (#EFE7E0 -> #E4DBD3) + 数万颗细密石版画点彩砂砾噪点；
 * 2. 两侧干净的纯白黑边路肩实线 (#FFFDF9) + 深褐灰砂石外路肩 (#3B2E31)，取代原先卡通感过强的红黄赛道彩边；
 * 3. 横向钢笔柏油接缝墨线 (Horizontal Ink Crack Strokes) 与行车轨迹光影色层；
 * 4. 路面两侧边缘斑驳的硬边树影色块 (#382A2D) 与散落的彩色纸屑光点。
 */
export function getCityPopRoadTexture(): THREE.CanvasTexture {
  if (roadTexCache) return roadTexCache;

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  let seed = 851985;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // 1. 暖米白/浅暖灰阳光沥青基底（对齐参考图 1 & 2 的路面底色）
  ctx.fillStyle = "#EDE4DC";
  ctx.fillRect(0, 0, 1024, 1024);

  // 车道光影色阶分层（受光暖白高光带 + 微暖灰中调带）
  ctx.fillStyle = "#F4EDE6";
  ctx.fillRect(145, 0, 290, 1024);
  ctx.fillRect(589, 0, 290, 1024);

  ctx.fillStyle = "#E2D7CE";
  ctx.fillRect(72, 0, 75, 1024);
  ctx.fillRect(435, 0, 154, 1024);
  ctx.fillRect(879, 0, 73, 1024);

  // 2. 石版画/丝网印刷细密点彩砂砾肌理 (28,000 颗微细深浅砂砾点，彻底告别塑料平涂感！)
  const grainColors = ["#C7BBB2", "#B5A79E", "#D6CBC2", "#FAF5F0", "#8C7D76"];
  for (let i = 0; i < 28000; i++) {
    const gx = Math.floor(rand() * 1024);
    const gy = Math.floor(rand() * 1024);
    const gw = rand() > 0.82 ? 3 : 2;
    const gh = rand() > 0.75 ? 2 : 1.5;
    ctx.fillStyle = grainColors[i % grainColors.length];
    ctx.fillRect(gx, gy, gw, gh);
  }

  // 3. 两侧深褐灰砂砾外路肩 (#3B2E31) + 纯白路肩实线 (#FFFDF9) + 统一粗细钢笔墨线（复刻参考图 1 左右路肩！）
  ctx.fillStyle = "#3A2C2F";
  ctx.fillRect(0, 0, 46, 1024);
  ctx.fillRect(978, 0, 46, 1024);

  // 外路肩砂石颗粒
  ctx.fillStyle = "#5C494D";
  for (let i = 0; i < 1600; i++) {
    const sx = rand() > 0.5 ? rand() * 42 : 980 + rand() * 42;
    const sy = rand() * 1024;
    ctx.fillRect(sx, sy, 2.5, 2);
  }

  // 纯白路肩边线 + 双侧锐利钢笔黑边 (46..72 and 952..978)
  ctx.fillStyle = "#141720";
  ctx.fillRect(44, 0, 30, 1024);
  ctx.fillRect(950, 0, 30, 1024);

  ctx.fillStyle = "#FFFDF9";
  ctx.fillRect(48, 0, 22, 1024);
  ctx.fillRect(954, 0, 22, 1024);

  // 4. 左右路边斑驳的树木/灌木硬边投射阴影块（复刻参考图 1 路面边缘的深褐墨影 + 横向排线碎边）
  ctx.fillStyle = "#322326";
  const shadowPatches = [
    { y: 140, w: 125, h: 64 },
    { y: 460, w: 165, h: 82 },
    { y: 790, w: 140, h: 70 },
  ];
  for (const sp of shadowPatches) {
    ctx.beginPath();
    ctx.ellipse(950 - sp.w * 0.32, sp.y, sp.w, sp.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 阴影前端横向钢笔排线笔触（复刻参考图 1 路面树影边缘的水平刻线）
    for (let k = -3; k <= 3; k++) {
      const stripLen = sp.w * (0.65 + (Math.abs(k) % 2) * 0.35);
      ctx.fillRect(950 - sp.w * 0.9 - stripLen * 0.6, sp.y + k * 9, stripLen, 4.5);
    }
  }

  // 5. 道路中央铃木英人式克制接缝墨线与分段白标线（摒弃突兀的高饱和双黄线，还原参考图 1 & 2 纯净的米白版画路面）
  ctx.fillStyle = "#241B1E";
  ctx.fillRect(510, 0, 4, 1024);
  for (let dashY = 40; dashY < 1024; dashY += 256) {
    ctx.fillStyle = "#181A22";
    ctx.fillRect(505, dashY - 3, 14, 118);
    ctx.fillStyle = "#FAF6F0";
    ctx.fillRect(508, dashY, 8, 112);
  }

  // 6. 铃木英人参考图 1 & 2 标志性的「横向柏油接缝钢笔墨线」与纵向细微钢笔掠线
  ctx.fillStyle = "#22181B";
  const horizCracks = [
    { x: 74, y: 115, w: 320, h: 4.5 },
    { x: 540, y: 255, w: 360, h: 4.0 },
    { x: 95, y: 425, w: 350, h: 4.0 },
    { x: 555, y: 605, w: 330, h: 4.5 },
    { x: 78, y: 765, w: 390, h: 5.0 },
    { x: 475, y: 915, w: 410, h: 4.5 },
  ];
  for (const hc of horizCracks) {
    ctx.fillRect(hc.x, hc.y, hc.w, hc.h);
    ctx.fillRect(hc.x + 22, hc.y + 8, hc.w * 0.48, 2.5);
  }

  // 纵向细钢笔速度线
  const longStrokes = [
    { x: 215, y: 80, h: 290, w: 2.5 },
    { x: 355, y: 520, h: 340, w: 2.5 },
    { x: 685, y: 160, h: 310, w: 2.5 },
    { x: 815, y: 580, h: 280, w: 2.5 },
  ];
  for (const ls of longStrokes) {
    ctx.fillRect(ls.x, ls.y, ls.w, ls.h);
  }

  // 7. 散落在路面上的少量铃木英人式黑边彩色纸屑光点 (Confetti Dots on Road)
  const confettiPalette = ["#EE4256", "#FFCC1B", "#38B6FF", "#FFFDF9"];
  for (let i = 0; i < 36; i++) {
    const cx = 90 + rand() * 840;
    const cy = rand() * 1000;
    const col = confettiPalette[i % confettiPalette.length];
    ctx.fillStyle = "#141720";
    ctx.fillRect(cx - 1.5, cy - 1.5, 9, 7);
    ctx.fillStyle = col;
    ctx.fillRect(cx, cy, 6, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  roadTexCache = tex;
  return tex;
}

let sidewalkTexCache: THREE.CanvasTexture | null = null;

/**
 * 生成海滨长廊粉色+天蓝几何拼花步道贴图（参考图 2 & 图 6）
 */
export function getSidewalkTileTexture(): THREE.CanvasTexture {
  if (sidewalkTexCache) return sidewalkTexCache;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  // 珊瑚粉主步道底色
  ctx.fillStyle = "#F488A2";
  ctx.fillRect(0, 0, 512, 512);

  // 靠近路缘一侧的天蓝与奶白棋盘格装饰带 (参考图 2)
  const tileRows = 8;
  const tileSize = 512 / tileRows;
  for (let r = 0; r < tileRows; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#29B2E8" : "#FFFDF6";
      ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
      ctx.strokeStyle = "#10131C";
      ctx.lineWidth = 3;
      ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
    }
  }

  // 粉色方砖接缝黑线
  ctx.strokeStyle = "#10131C";
  ctx.lineWidth = 3;
  for (let r = 0; r <= tileRows; r++) {
    ctx.beginPath();
    ctx.moveTo(tileSize * 2, r * tileSize);
    ctx.lineTo(512, r * tileSize);
    ctx.stroke();
  }
  for (let c = 2; c <= tileRows; c++) {
    ctx.beginPath();
    ctx.moveTo(c * tileSize, 0);
    ctx.lineTo(c * tileSize, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  sidewalkTexCache = tex;
  return tex;
}

/**
 * 参考用户提供的 4 张 City Pop 海浪/水面插画参考图风格：色彩分层 + 分层钢笔描线海面 ShaderMaterial
 * - 与云彩、远山、草地保持统一的渲染语言：以海岸距离与纵向世界坐标的域扭曲分形噪声 (domain-warped FBM)
 *   塑造横向拉长、首尾尖锐收束的流体波纹丝带与近岸浪花；
 * - 划分为 5 阶高对比 City Pop 海水色层（深海宝蓝 -> 澄澈钴蓝 -> 明亮天蓝 -> 清透冰青 -> 浪花纯白）；
 * - 在每一级色层交界处通过 fwidth 屏幕导数绘制干净锐利的细钢笔轮廓墨线 (#0E1C3C)，并在远景地平线处柔和收敛，
 *   兼顾近景的版画笔触感与远海的清澈透视感。
 */
export function createCityPopOceanMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uDeepColor: { value: new THREE.Color("#063280") },
      uMidColor: { value: new THREE.Color("#0E5EC2") },
      uCyanColor: { value: new THREE.Color("#259CE8") },
      uFoamShadow: { value: new THREE.Color("#63D4F5") },
      uFoamColor: { value: new THREE.Color("#F6FDFF") },
      uSunColor: { value: new THREE.Color("#FFFDF5") },
      uHorizonColor: { value: new THREE.Color("#9FD8FA") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSunset;
      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uCyanColor;
      uniform vec3 uFoamShadow;
      uniform vec3 uFoamColor;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;

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

      float fbmOcean(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        mat2 rot = mat2(0.86, 0.51, -0.51, 0.86);
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = rot * p * 2.04 + vec2(9.2, 4.7);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        // s (0.0 -> 1.0)：0 为近岸防波堤，1 为远海地平线（约 391m 宽）
        float s = clamp(vUv.x, 0.0, 1.0);
        float distM = s * 391.0;
        float wz = vWorldPos.z;
        float t = uTime;

        // 1. 域扭曲流体波纹标量场：横向沿海岸拉长，形成参考图 1 / 3 / 4 中首尾尖锐的液态波纹丝带
        vec2 flowUv = vec2(distM * 0.145 - t * 0.32, wz * 0.038 + t * 0.06);
        vec2 warp = vec2(
          fbmOcean(flowUv * 0.72 + vec2(1.3, 4.1)),
          fbmOcean(flowUv * 0.72 + vec2(6.8, 2.5))
        );
        float ribbonMain = fbmOcean(flowUv + (warp - 0.5) * 1.35);
        float ribbonFine = fbmOcean(vec2(distM * 0.34 - t * 0.45, wz * 0.095) + (warp - 0.5) * 0.85);

        // 沿海岸方向的中海长涌起伏，营造有节奏的浪峰与浪谷带
        float swellBand = sin(distM * 0.11 - t * 0.85 + (warp.y - 0.5) * 3.2) * 0.14;

        // 近岸拍岸浪花抬升 (0..22m)：保证防波堤边缘有清晰舒展的纯白/冰青泡沫带
        float shoreLap = sin(wz * 0.075 + t * 1.1) * 0.012 + (warp.x - 0.5) * 0.025;
        float shoreBoost = (1.0 - smoothstep(0.0, 0.065 + shoreLap * 0.4, s)) * 0.62;

        // 远景收敛：越靠近地平线波纹振幅越柔和，色调过渡至清澈浅天蓝地平线（对齐参考图 2 & 3）
        float farCalm = 1.0 - smoothstep(0.42, 0.90, s);

        float waveVal = ((ribbonMain - 0.48) * 0.95 + (ribbonFine - 0.5) * 0.42 + swellBand) * (0.35 + 0.65 * farCalm)
                      + shoreBoost
                      - smoothstep(0.18, 0.72, s) * 0.12;

        // 2. 五阶 City Pop 海水分层色阶（noon 原色 <-> sunset 暮紫靛海/玫瑰粉浪/暖金泡沫）
        const float T1 = -0.14;
        const float T2 =  0.03;
        const float T3 =  0.20;
        const float T4 =  0.34;

        vec3 cDeep = mix(uDeepColor, vec3(0.078, 0.094, 0.306), uSunset);
        vec3 cMid  = mix(uMidColor,  vec3(0.169, 0.180, 0.471), uSunset);
        vec3 cCyan = mix(uCyanColor, vec3(0.541, 0.235, 0.494), uSunset);
        vec3 cFShd = mix(uFoamShadow,vec3(0.910, 0.439, 0.416), uSunset);
        vec3 cFoam = mix(uFoamColor, vec3(1.000, 0.827, 0.604), uSunset);

        vec3 col = cDeep;
        if (waveVal > T4) {
          col = cFoam;
        } else if (waveVal > T3) {
          col = cFShd;
        } else if (waveVal > T2) {
          col = cCyan;
        } else if (waveVal > T1) {
          col = cMid;
        } else {
          col = cDeep;
        }

        // 3. 在每一层色彩分界线处绘制干净平滑的细钢笔分层描线（远海逐步淡出以防走样）
        vec3 inkCol = mix(vec3(0.055, 0.110, 0.235), vec3(0.102, 0.063, 0.200), uSunset); // #0E1C3C / #1A1033
        float fw = clamp(fwidth(waveVal), 0.003, 0.024);
        float bandEdge = min(
          min(abs(waveVal - T1), abs(waveVal - T2)),
          min(abs(waveVal - T3), abs(waveVal - T4))
        );
        float inkFade = 1.0 - smoothstep(0.36, 0.76, s);
        if (bandEdge < fw * 0.88 && inkFade > 0.02) {
          col = mix(col, inkCol, 0.84 * inkFade);
        }

        // 4. 远海地平线前方的清澈天蓝/橘金水天过渡带 + 细微水平浪脊线
        float horizonMix = smoothstep(0.62, 0.98, s);
        col = mix(col, uHorizonColor, horizonMix * 0.68);
        float farRipple = abs(fract(distM * 0.055 + sin(wz * 0.04) * 0.15) - 0.5);
        if (s > 0.48 && s < 0.88 && farRipple < 0.035) {
          float dash = noise2D(vec2(wz * 0.22, distM * 0.08));
          if (dash > 0.45) {
            col = mix(col, cFoam, 0.65 * (1.0 - horizonMix * 0.5));
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

const cloudMatCache = new Map<number, THREE.ShaderMaterial>();

/**
 * 复刻参考图 1 / 图 2 / 图 4 的「真实感多色阶分层积雨云与地平线层云」GLSL ShaderMaterial
 * - 摒弃生硬对称的圆形棉花糖云柱，采用 Domain-Warped Billow FBM 分形花椰菜湍流场塑造斜向翻涌的主积雨云砧顶、次级云肩与地平线水平条带层云；
 * - 内部按受光角度与翻涌体块划分为 5 阶冷暖版画色带（暖奶油杏白 #FFF3DD -> 柔杏粉 #F5C7A8 -> 鼠尾草灰青 #9BC0BF -> 雾紫灰蓝 #82A0C2 -> 深钢蓝暗部 #4A6A94）；
 * - 每一级色带交界处与外轮廓均通过屏幕偏导数 fwidth 绘制精细的深色钢笔勾线 (#1B2436)。
 */
export function createCityPopCloudMaterial(seed = 1): THREE.ShaderMaterial {
  const cached = cloudMatCache.get(seed);
  if (cached) return cached;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSeed: { value: seed * 1.37 },
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocalPos;
      void main() {
        vUv = uv;
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSeed;
      uniform float uSunset;
      varying vec2 vUv;
      varying vec3 vLocalPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7) + uSeed * 0.1);
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
        return 1.0 - pow(c, 1.65);
      }

      float fbmCauliflower(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          v += a * puffNoise(p);
          p = rot * p * 2.04 + vec2(4.1, 2.3);
          a *= 0.49;
        }
        return v;
      }

      // 圆润云泡包络，用于塑造饱满真实的积雨云外轮廓
      float cloudLobe(vec2 p, vec2 center, vec2 radii) {
        vec2 d = (p - center) / radii;
        return (1.0 - length(d)) * min(radii.x, radii.y);
      }

      float cumulusEnvelope(float ang, float v, float centerAng, float baseW, float topH, float leanDir, int variant) {
        float dx = atan(sin(ang - centerAng), cos(ang - centerAng)) / max(0.08, baseW);
        dx -= leanDir * (v - 0.14) * 0.28;
        float y = (v - 0.10) / max(0.15, topH);
        if (y < -0.15 || abs(dx) > 2.2) return -1.0;

        float d = -1.0;
        if (variant == 0) {
          // 车头正前方主积雨云：保持当前造型不变
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.00, 0.34), vec2(0.74, 0.36)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.54, 0.22), vec2(0.54, 0.27)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.56, 0.20), vec2(0.56, 0.25)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.22, 0.56), vec2(0.48, 0.29)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.28, 0.48), vec2(0.45, 0.26)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.04, 0.80), vec2(0.35, 0.24)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.68, 0.40), vec2(0.28, 0.20)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.46, 0.66), vec2(0.24, 0.18)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.50, 0.60), vec2(0.24, 0.17)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.72, 0.36), vec2(0.26, 0.18)));
        } else if (variant == 1) {
          // 造型 1：斜向舒展的平顶砧状积雨云（左高右长拖尾）
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.35, 0.38), vec2(0.56, 0.34)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.48, 0.70), vec2(0.42, 0.22)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.18, 0.66), vec2(0.58, 0.18)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.76, 0.56), vec2(0.54, 0.15)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.32, 0.26), vec2(0.68, 0.24)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.88, 0.18), vec2(0.44, 0.18)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 1.05, 0.14), vec2(0.48, 0.14)));
        } else if (variant == 2) {
          // 造型 2：右高左低的阶梯叠云 + 浮空伴生小云团
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.36, 0.42), vec2(0.52, 0.36)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.44, 0.76), vec2(0.32, 0.22)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.04, 0.52), vec2(0.36, 0.24)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.42, 0.26), vec2(0.66, 0.24)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.96, 0.16), vec2(0.42, 0.16)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.88, 0.24), vec2(0.36, 0.20)));
          // 左侧高空离散小云泡
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.62, 0.72), vec2(0.24, 0.12)));
        } else {
          // 造型 3：下窄上蓬松的蘑菇塔状积雨云 + 侧翼碎云
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.00, 0.26), vec2(0.44, 0.26)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.18, 0.58), vec2(0.54, 0.26)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.24, 0.62), vec2(0.48, 0.24)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.02, 0.86), vec2(0.36, 0.18)));
          d = max(d, cloudLobe(vec2(dx, y), vec2(-0.62, 0.54), vec2(0.26, 0.14)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.66, 0.48), vec2(0.28, 0.15)));
          d = max(d, cloudLobe(vec2(dx, y), vec2( 0.88, 0.16), vec2(0.34, 0.12)));
        }

        float flatBase = y - 0.03 + sin(dx * 5.0) * 0.012;
        return min(d, flatBase);
      }

      void main() {
        // 使用三维圆柱水平方位角 ang in [-PI, PI] (0 = 正前方 +Z) 与周期圆环坐标，实现 360° 完全无缝环绕地平线
        float ang = atan(vLocalPos.x, vLocalPos.z);
        float v = vUv.y;
        vec3 inkCol = mix(vec3(0.14, 0.20, 0.29), vec3(0.149, 0.075, 0.180), uSunset); // #24334A / #26132E

        // 周期圆环噪声坐标（在 360° 任意角度绝对连续无接缝）
        float angSkew = ang + (v - 0.12) * 0.18;
        vec2 ring = vec2(sin(angSkew), cos(angSkew));
        vec2 p = vec2(ring.x * 4.4 + ring.y * 2.6, v * 3.0 + ring.y * 0.45);

        // 1. 积雨云饱满外轮廓包络：保留车头主云 (variant=0)，其余方位切换不同造型
        float env = -1.0;
        env = max(env, cumulusEnvelope(ang, v, -0.22, 0.25, 0.62,  0.32, 0));
        env = max(env, cumulusEnvelope(ang, v,  0.34, 0.19, 0.42, -0.22, 1));
        env = max(env, cumulusEnvelope(ang, v, -0.82, 0.21, 0.45,  0.18, 2));
        env = max(env, cumulusEnvelope(ang, v,  1.05, 0.23, 0.50,  0.28, 3));
        env = max(env, cumulusEnvelope(ang, v, -1.65, 0.23, 0.46, -0.20, 1));
        env = max(env, cumulusEnvelope(ang, v,  2.35, 0.25, 0.56,  0.24, 2));
        env = max(env, cumulusEnvelope(ang, v, -2.55, 0.23, 0.44, -0.28, 3));

        // 保留上一版精致的域扭曲花椰菜体积噪波场 (q, r, finePuff)
        vec2 q = vec2(fbmCauliflower(p), fbmCauliflower(p + vec2(3.4, 1.9)));
        vec2 r = vec2(
          fbmCauliflower(p + 1.15 * q + vec2(1.7, 6.2)),
          fbmCauliflower(p + 1.15 * q + vec2(5.1, 2.8))
        );
        float finePuff = puffNoise(p * 3.2 + 0.9 * r);

        // 温和叠加外轮廓花椰菜起伏，保持饱满云形而不破碎
        float cloudSdf = env + (r.x - 0.58) * 0.11 + (finePuff - 0.60) * 0.035;

        // 地平线低空连绵水平层云带
        vec2 stratusP = vec2(ring.x * 5.2 - ring.y * 3.1, v * 28.0);
        float stratusN = fbmCauliflower(stratusP);
        float stratusSdf = (stratusN - 0.56) * 0.22 - abs(v - 0.12) * 1.35;

        float finalDensity = max(cloudSdf, stratusSdf);
        if (finalDensity <= 0.0001) discard;

        // 2. 完整保留上一版「左迎光、右背光」的多阶精细法线明暗场与层次线条
        float eps = 0.022;
        vec2 ringPlus = vec2(sin(angSkew + eps), cos(angSkew + eps));
        vec2 ringMinus = vec2(sin(angSkew - eps), cos(angSkew - eps));
        vec2 pPlus = vec2(ringPlus.x * 4.4 + ringPlus.y * 2.6, v * 3.0 + ringPlus.y * 0.45);
        vec2 pMinus = vec2(ringMinus.x * 4.4 + ringMinus.y * 2.6, v * 3.0 + ringMinus.y * 0.45);
        float hPlus = (fbmCauliflower(pPlus + 1.15 * q) - 0.58) * 0.32;
        float hMinus = (fbmCauliflower(pMinus + 1.15 * q) - 0.58) * 0.32;
        float normalSun = clamp((hMinus - hPlus) * 5.0, -0.45, 0.45);

        float lightVal = 0.54
          + normalSun * 0.58
          + (v - 0.24) * 0.36
          + (r.y - 0.58) * 0.38
          + (finePuff - 0.60) * 0.16;

        float fwD = clamp(fwidth(finalDensity), 0.0016, 0.012);
        float fwL = clamp(fwidth(lightVal), 0.0020, 0.015);

        // 3. 五阶日系积雨云版画分层配色（noon 保持纯白通透 <-> sunset 晚霞蜜桃橙粉与暮紫阴影）
        vec3 cPureWhite  = mix(vec3(1.000, 0.996, 0.988), vec3(1.000, 0.906, 0.769), uSunset); // #FFFDFC / #FFE7C4
        vec3 cCreamWhite = mix(vec3(0.976, 0.961, 0.925), vec3(1.000, 0.675, 0.549), uSunset); // #F9F5EC / #FFAC8C
        vec3 cMistCyan   = mix(vec3(0.796, 0.875, 0.914), vec3(0.788, 0.357, 0.525), uSunset); // #CBE0E9 / #C95B86
        vec3 cSlateBlue  = mix(vec3(0.620, 0.733, 0.835), vec3(0.341, 0.173, 0.431), uSunset); // #9EBBD5 / #572C6E
        vec3 cDeepBase   = mix(vec3(0.416, 0.549, 0.706), vec3(0.180, 0.106, 0.302), uSunset); // #6A8CB4 / #2E1B4D

        vec3 col = cDeepBase;
        if (lightVal > 0.70) {
          col = cPureWhite;
        } else if (lightVal > 0.54) {
          col = cCreamWhite;
        } else if (lightVal > 0.40) {
          col = cMistCyan;
        } else if (lightVal > 0.26) {
          col = cSlateBlue;
        } else {
          col = cDeepBase;
        }

        if (stratusSdf > cloudSdf) {
          col = stratusN > 0.62 ? cCreamWhite : (stratusN > 0.55 ? cMistCyan : cSlateBlue);
        }

        // 4. 外轮廓与内部每一层色块分界处的精致钢笔勾线（完全对齐上一版艺术表现形式）
        bool isOuterInk = finalDensity < fwD * 1.25;
        float distBand = min(
          min(abs(lightVal - 0.26), abs(lightVal - 0.40)),
          min(abs(lightVal - 0.54), abs(lightVal - 0.70))
        );
        bool isInnerInk = distBand < fwL * 0.82;

        if (isOuterInk || isInnerInk) {
          col = mix(col, inkCol, isOuterInk ? 0.90 : 0.74);
        }

        // 云底接近海平线处柔和衔接
        float horizonFade = smoothstep(0.015, 0.045, v);
        gl_FragColor = vec4(col, horizonFade);
      }
    `,
  });

  cloudMatCache.set(seed, mat);
  return mat;
}

export type CityPopSignVariant =
  | "pacific"
  | "shop"
  | "mall"
  | "diner"
  | "yacht"
  | "coast"
  | "mart"
  | "stereo"
  | "motel"
  | "american_inn"
  | "happy_moments"
  | "highway_guide";

const signTexCache = new Map<CityPopSignVariant, THREE.CanvasTexture>();

/**
 * 程序化绘制 80s City Pop 街头霓虹招牌与海岸高速公路路牌贴图（对齐参考图 1 / 2 / 3 / 4）
 */
export function getCityPopSignTexture(
  variant: CityPopSignVariant
): THREE.CanvasTexture {
  const cached = signTexCache.get(variant);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  if (variant === "highway_guide") {
    // 铃木英人式三阶色彩分层翠绿海岸公路导引路牌（暗部青绿 -> 主体翠绿 -> 暖阳薄荷高光色块 + 粗黑钢笔描边）
    ctx.fillStyle = "#085E46";
    ctx.fillRect(0, 0, 512, 256);

    // 中间阶梯色层
    ctx.fillStyle = "#0E7C5B";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(430, 0);
    ctx.lineTo(340, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();

    // 左上受光暖薄荷高光阶梯层（体现色彩分层的光影立体感）
    ctx.fillStyle = "#1DA378";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(250, 0);
    ctx.lineTo(155, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();

    // 分层色块交界处的细黑钢笔勾线
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10131C";
    ctx.beginPath();
    ctx.moveTo(250, 0);
    ctx.lineTo(155, 256);
    ctx.moveTo(430, 0);
    ctx.lineTo(340, 256);
    ctx.stroke();

    // 外层钢笔墨线框 + 白色反光内框
    ctx.lineWidth = 14;
    ctx.strokeStyle = "#10131C";
    ctx.strokeRect(7, 7, 498, 242);

    ctx.lineWidth = 7;
    ctx.strokeStyle = "#FFFDF5";
    ctx.strokeRect(20, 20, 472, 216);

    // 左侧国道 134 号蓝色盾牌徽标
    ctx.fillStyle = "#1452C8";
    ctx.fillRect(38, 42, 112, 92);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#10131C";
    ctx.strokeRect(38, 42, 112, 92);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FFFDF5";
    ctx.strokeRect(43, 47, 102, 82);

    ctx.fillStyle = "#FFD026";
    ctx.font = "900 18px 'Arial Black', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ROUTE", 94, 64);
    ctx.fillStyle = "#FFFDF5";
    ctx.font = "900 40px 'Arial Black', sans-serif";
    ctx.fillText("134", 94, 102);

    // 主方向文字与粗箭头（湘南 SHONAN ↑ / 逗子 ZUSHI ↗）
    ctx.textAlign = "left";
    ctx.font = "900 44px 'Arial Black', 'Hiragino Sans', sans-serif";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#10131C";
    ctx.strokeText("SHONAN 湘南 ↑", 168, 78);
    ctx.fillStyle = "#FFFDF5";
    ctx.fillText("SHONAN 湘南 ↑", 168, 78);

    ctx.font = "900 32px 'Arial Black', 'Hiragino Sans', sans-serif";
    ctx.strokeText("ZUSHI 逗子 · 葉山 ↗", 168, 128);
    ctx.fillStyle = "#FFD026";
    ctx.fillText("ZUSHI 逗子 · 葉山 ↗", 168, 128);

    // 底部深海蓝里程横条
    ctx.fillStyle = "#10131C";
    ctx.fillRect(36, 162, 440, 54);
    ctx.fillStyle = "#1452C8";
    ctx.fillRect(40, 166, 432, 46);
    ctx.font = "900 24px monospace, sans-serif";
    ctx.fillStyle = "#FFFDF5";
    ctx.fillText("BAYSHORE HWY // 2.5 KM   EXIT →", 54, 190);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    signTexCache.set(variant, tex);
    return tex;
  }

  const configs: Record<
    Exclude<CityPopSignVariant, "highway_guide">,
    {
      bg: string;
      border: string;
      accent: string;
      title: string;
      sub: string;
      textColor: string;
    }
  > = {
    pacific: {
      bg: "#1652D0",
      border: "#FFD026",
      accent: "#3CC2FA",
      title: "PACIFIC PLAZA",
      sub: "BAYSIDE RESORT // 1985",
      textColor: "#FFFDF5",
    },
    shop: {
      bg: "#0E3FB2",
      border: "#10131C",
      accent: "#F4689E",
      title: "SHOP",
      sub: "CITY POP RECORDS & TAPES",
      textColor: "#4EB5FF",
    },
    mall: {
      bg: "#FAF5E8",
      border: "#EE4256",
      accent: "#1750D6",
      title: "MALL",
      sub: "COASTAL ARCADE · 24H",
      textColor: "#EE4256",
    },
    diner: {
      bg: "#EE4256",
      border: "#FFD026",
      accent: "#1750D6",
      title: "POP DINER",
      sub: "COLD DRINKS & BURGERS · ゲーム",
      textColor: "#FFFDF5",
    },
    yacht: {
      bg: "#00469B",
      border: "#FFBD1B",
      accent: "#F5649D",
      title: "YACHT WORLD",
      sub: "MARINA CLUB // STEREO ステレオ",
      textColor: "#FFBD1B",
    },
    coast: {
      bg: "#FFBD1B",
      border: "#10131C",
      accent: "#00469B",
      title: "COAST 2 COAST",
      sub: "BAYSHORE HIGHWAY · 湾岸線",
      textColor: "#10131C",
    },
    mart: {
      bg: "#F4729A",
      border: "#1750D6",
      accent: "#FFFDF5",
      title: "Mart",
      sub: "NEW STORE · ほやほや OPEN",
      textColor: "#63C5FF",
    },
    stereo: {
      bg: "#2499E8",
      border: "#FAF5E8",
      accent: "#EE4256",
      title: "STEREO 85",
      sub: "FM 84.7 MHZ // SUMMER WAVE",
      textColor: "#FFFDF5",
    },
    motel: {
      bg: "#D9232E",
      border: "#FFFDF5",
      accent: "#1750D6",
      title: "MOTEL",
      sub: "VACANCY · COMMERCIAL RATES · TV",
      textColor: "#FFFDF5",
    },
    american_inn: {
      bg: "#FFF3D6",
      border: "#10131C",
      accent: "#FFCC1B",
      title: "AMERICAN",
      sub: "MOTOR INN · BEST WESTERN · COFFEE",
      textColor: "#10131C",
    },
    happy_moments: {
      bg: "#FFFDF8",
      border: "#10131C",
      accent: "#D9232E",
      title: "Happy Motel",
      sub: "HAPPY MOMENTS · COLD DRINKS & ROOMS",
      textColor: "#D9232E",
    },
  };

  const cfg = configs[variant];

  ctx.fillStyle = cfg.bg;
  ctx.fillRect(0, 0, 512, 256);

  // 装饰几何彩虹圆弧
  ctx.fillStyle = cfg.accent;
  ctx.beginPath();
  ctx.arc(430, 128, 95, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#10131C";
  ctx.stroke();

  ctx.lineWidth = 14;
  ctx.strokeStyle = "#10131C";
  ctx.strokeRect(7, 7, 498, 242);

  ctx.lineWidth = 6;
  ctx.strokeStyle = cfg.border;
  ctx.strokeRect(20, 20, 472, 216);

  ctx.font = "900 64px 'Arial Black', 'Impact', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#10131C";
  ctx.fillText(cfg.title, 42, 118);

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#10131C";
  ctx.strokeText(cfg.title, 34, 110);

  ctx.fillStyle = cfg.textColor;
  ctx.fillText(cfg.title, 34, 110);

  ctx.fillStyle = "#10131C";
  ctx.fillRect(34, 168, 444, 44);
  ctx.font = "bold 22px monospace, sans-serif";
  ctx.fillStyle = "#FFFDF5";
  ctx.fillText(cfg.sub, 50, 191);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  signTexCache.set(variant, tex);
  return tex;
}

const hotelTexCache = new Map<string, THREE.CanvasTexture>();

/**
 * 程序化生成参考图 6 / 图 1 中的现代主义海景酒店网格玻璃幕墙贴图
 */
export function getHotelFacadeTexture(
  wallColor: string,
  glassColor: string
): THREE.CanvasTexture {
  const key = `${wallColor}_${glassColor}`;
  const cached = hotelTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, 512, 512);

  const cols = 6;
  const rows = 8;
  const padX = 20;
  const padY = 20;
  const cellW = (512 - padX * 2) / cols;
  const cellH = (512 - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    // 楼层水平腰线与阳台阴影带
    ctx.fillStyle = "rgba(16, 19, 28, 0.16)";
    ctx.fillRect(10, padY + r * cellH - 4, 492, 6);

    for (let c = 0; c < cols; c++) {
      const wx = padX + c * cellW + 5;
      const wy = padY + r * cellH + 6;
      const ww = cellW - 10;
      const wh = cellH - 12;

      ctx.fillStyle = glassColor;
      ctx.fillRect(wx, wy, ww, wh);

      // 赛璐璐斜向天蓝玻璃高光条带
      ctx.fillStyle = "#5CC2FF";
      ctx.beginPath();
      ctx.moveTo(wx + 4, wy + 4);
      ctx.lineTo(wx + ww * 0.58, wy + 4);
      ctx.lineTo(wx + ww * 0.25, wy + wh - 4);
      ctx.lineTo(wx + 4, wy + wh - 4);
      ctx.closePath();
      ctx.fill();

      // 局部暖光窗格细节
      if ((r * 3 + c * 5) % 11 === 0) {
        ctx.fillStyle = "#FFE066";
        ctx.fillRect(wx + ww * 0.55, wy + wh * 0.45, ww * 0.35, wh * 0.45);
      }

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#10131C";
      ctx.strokeRect(wx, wy, ww, wh);
    }
  }

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#10131C";
  ctx.strokeRect(5, 5, 502, 502);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  hotelTexCache.set(key, tex);
  return tex;
}


let sharedMeadowHillMat: THREE.ShaderMaterial | null = null;

/**
 * 参考用户提供的 3 张 City Pop / 动画插画参考图风格：色彩分层 + 分层钢笔描线草地/灌木丘陵 ShaderMaterial
 * - 与云彩、远山保持一致的渲染语言：以世界空间域扭曲分形噪声 (domain-warped FBM) + 3D 地形受光构建连续标量场；
 * - 划分为 5 阶高对比赛璐璐草甸色层（深松青墨绿 -> 浓郁森林绿 -> 明快翠绿 -> 阳光嫩草绿 -> 暖阳黄绿高光）；
 * - 每一级色块交界处均通过 fwidth 屏幕导数绘制干净锐利的细钢笔轮廓墨线 (#141C2E)，彻底消除平涂色块感与跨区块接缝。
 */
export function getCityPopMeadowHillMaterial(): THREE.ShaderMaterial {
  if (sharedMeadowHillMat) return sharedMeadowHillMat;

  sharedMeadowHillMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uFadeCarZ: CITYPOP_FADE_UNIFORMS.uCarZ,
      uFadeStart: CITYPOP_FADE_UNIFORMS.uFadeStart,
      uFadeEnd: CITYPOP_FADE_UNIFORMS.uFadeEnd,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vFadeWorldZ;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vFadeWorldZ = wp.z;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSunset;
      uniform float uFadeCarZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
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

      float fbmGrass(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = rot * p * 2.06 + vec2(11.3, 5.7);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        ${CITYPOP_FADE_FRAG_SNIPPET}

        vec2 wpXZ = vWorldPos.xz;
        vec3 n = normalize(vWorldNormal);
        vec3 sunDir = normalize(vec3(-0.55, 0.78, 0.28));
        float ndotl = dot(n, sunDir);

        // 1. 世界空间域扭曲分形草丛团簇（跨区块无缝衔接，形成参考图般的有机叶片/草坡色块轮廓）
        vec2 warp = vec2(
          fbmGrass(wpXZ * 0.075 + vec2(1.4, 3.8)),
          fbmGrass(wpXZ * 0.075 + vec2(7.2, 2.1))
        );
        float macroCluster = fbmGrass(wpXZ * 0.115 + (warp - 0.5) * 1.15);
        float tuftDetail = (noise2D(wpXZ * 0.46 + (warp - 0.5) * 0.65) - 0.5) * 0.18;

        // 路肩/步道外沿轻微压暗，形成贴近路边的深墨绿草丛暗部轮廓带
        float edgeShade = smoothstep(0.0, 0.055, vUv.x) * 0.22 - 0.22;

        float grassVal = (macroCluster - 0.5) * 0.92
                       + tuftDetail
                       + (ndotl - 0.65) * 0.48
                       + edgeShade
                       + clamp(vWorldPos.y * 0.025, 0.0, 0.18);

        // 2. 五阶赛璐璐草甸色层（noon 翠绿草坡 <-> sunset 暮紫青影与暖金夕照草坪）
        vec3 inkCol      = mix(vec3(0.078, 0.110, 0.176), vec3(0.118, 0.082, 0.169), uSunset); // #141C2E / #1E152B
        vec3 cDeepShadow = mix(vec3(0.055, 0.165, 0.145), vec3(0.082, 0.141, 0.220), uSunset); // #0E2A25 / #152438
        vec3 cDarkForest = mix(vec3(0.095, 0.345, 0.235), vec3(0.141, 0.259, 0.278), uSunset); // #18583C / #244247
        vec3 cMidMeadow  = mix(vec3(0.185, 0.575, 0.315), vec3(0.337, 0.420, 0.243), uSunset); // #2F9350 / #566B3E
        vec3 cSunGrass   = mix(vec3(0.455, 0.775, 0.345), vec3(0.651, 0.553, 0.235), uSunset); // #74C658 / #A68D3C
        vec3 cBrightTip  = mix(vec3(0.755, 0.905, 0.445), vec3(0.910, 0.722, 0.345), uSunset); // #C1E771 / #E8B858

        const float T1 = -0.18;
        const float T2 = -0.02;
        const float T3 =  0.14;
        const float T4 =  0.29;

        vec3 col = cDeepShadow;
        if (grassVal > T4) {
          col = cBrightTip;
        } else if (grassVal > T3) {
          col = cSunGrass;
        } else if (grassVal > T2) {
          col = cMidMeadow;
        } else if (grassVal > T1) {
          col = cDarkForest;
        } else {
          col = cDeepShadow;
        }

        // 3. 在每一层色彩分界线处绘制干净平滑的细钢笔分层描线（与云彩、远山一致）
        float fw = clamp(fwidth(grassVal), 0.004, 0.024);
        float bandEdge = min(
          min(abs(grassVal - T1), abs(grassVal - T2)),
          min(abs(grassVal - T3), abs(grassVal - T4))
        );
        if (bandEdge < fw * 0.85) {
          col = mix(col, inkCol, 0.86);
        }

        // 4. 向阳草坡上点缀少量细微野花彩点
        if (grassVal > T2 && bandEdge > fw * 1.4) {
          vec2 flowerCell = floor(wpXZ * 1.65);
          float fRnd = hash21(flowerCell);
          if (fRnd > 0.972) {
            col = fRnd > 0.990
              ? vec3(0.96, 0.28, 0.38)
              : fRnd > 0.980
              ? vec3(1.0, 0.86, 0.22)
              : vec3(1.0, 0.99, 0.94);
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return sharedMeadowHillMat;
}

let sharedSeawallMat: THREE.ShaderMaterial | null = null;

/**
 * 铃木英人 City Pop 风格海滨混凝土防波堤（河堤）立面 ShaderMaterial：
 * - 结合海湾弯道 3D 法线受光 (ndotl)、堤顶压石投影暗带、海面水线潮湿反光带与世界空间域扭曲分形风化场；
 * - 划分为 5 阶赛璐璐冷暖混凝土色层（深钴蓝水线暗部 -> 晴空冷蓝灰 -> 紫灰蓝中调 -> 亮月白受光面 -> 暖阳奶油白高光）；
 * - 每一级色彩分界线及混凝土垂直伸缩缝均通过 fwidth 屏幕导数绘制锐利的细钢笔轮廓墨线 (#141C2E)。
 */
export function getCityPopSeawallMaterial(): THREE.ShaderMaterial {
  if (sharedSeawallMat) return sharedSeawallMat;

  sharedSeawallMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uFadeCarZ: CITYPOP_FADE_UNIFORMS.uCarZ,
      uFadeStart: CITYPOP_FADE_UNIFORMS.uFadeStart,
      uFadeEnd: CITYPOP_FADE_UNIFORMS.uFadeEnd,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vFadeWorldZ;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vFadeWorldZ = wp.z;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSunset;
      uniform float uFadeCarZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
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

      float fbmWall(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        mat2 rot = mat2(0.84, 0.54, -0.54, 0.84);
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = rot * p * 2.04 + vec2(8.3, 4.1);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        ${CITYPOP_FADE_FRAG_SNIPPET}

        vec3 n = normalize(vWorldNormal);
        vec3 sunDir = normalize(vec3(-0.55, 0.78, 0.28));
        float ndotl = dot(n, sunDir);

        // 1. 世界空间域扭曲混凝土质感与光影起伏场（跨区块无缝衔接）
        vec2 wallCoord = vec2(vWorldPos.z * 0.14, vWorldPos.y * 0.65);
        vec2 warp = vec2(
          fbmWall(wallCoord * 0.75 + vec2(1.7, 3.2)),
          fbmWall(wallCoord * 0.75 + vec2(6.4, 1.9))
        );
        float macroWave = fbmWall(wallCoord + (warp - 0.5) * 1.10);
        float microGrit = (noise2D(vec2(vWorldPos.z * 1.1, vWorldPos.y * 2.4)) - 0.5) * 0.10;

        // 垂直伸缩缝（每 7.5m 一道混凝土板缝，带左侧细微受光/背阴台阶）
        float panelPhase = fract(vWorldPos.z / 7.5);
        float panelShade = (panelPhase < 0.08) ? -0.14 : (panelPhase > 0.92 ? 0.08 : 0.0);

        // 堤顶压石下方投影暗带 (vUv.y 接近 1.0) 与海面水线潮湿暗带 (vUv.y 接近 0.0)
        float capShadow = smoothstep(0.80, 0.98, vUv.y) * 0.46;
        float waterlineDark = (1.0 - smoothstep(0.08, 0.34, vUv.y)) * 0.38;
        // 中上部受光斜坡梯度
        float verticalLift = smoothstep(0.20, 0.78, vUv.y) * 0.34;

        float wallVal = verticalLift
                      + (macroWave - 0.5) * 0.46
                      + microGrit
                      + (ndotl - 0.35) * 0.48
                      + panelShade
                      - capShadow
                      - waterlineDark;

        // 2. 五阶赛璐璐冷暖混凝土色层（noon 清冷月白 <-> sunset 暮紫水线与珊瑚橘金受光）
        vec3 inkCol         = mix(vec3(0.078, 0.110, 0.176), vec3(0.129, 0.075, 0.180), uSunset); // #141C2E / #21132E
        vec3 cDeepWet       = mix(vec3(0.169, 0.263, 0.431), vec3(0.133, 0.106, 0.259), uSunset); // #2B436E / #221B42
        vec3 cCoolShadow    = mix(vec3(0.369, 0.482, 0.659), vec3(0.302, 0.220, 0.431), uSunset); // #5E7BA8 / #4D386E
        vec3 cMidPeriwinkle = mix(vec3(0.608, 0.690, 0.808), vec3(0.561, 0.365, 0.510), uSunset); // #9BB0CE / #8F5D82
        vec3 cWarmConcrete  = mix(vec3(0.863, 0.886, 0.925), vec3(0.851, 0.549, 0.478), uSunset); // #DCE2EC / #D98C7A
        vec3 cSunHighlight  = mix(vec3(1.000, 0.984, 0.949), vec3(1.000, 0.835, 0.651), uSunset); // #FFFBF2 / #FFD5A6

        const float T1 = -0.14;
        const float T2 =  0.04;
        const float T3 =  0.22;
        const float T4 =  0.39;

        vec3 col = cDeepWet;
        if (wallVal > T4) {
          col = cSunHighlight;
        } else if (wallVal > T3) {
          col = cWarmConcrete;
        } else if (wallVal > T2) {
          col = cMidPeriwinkle;
        } else if (wallVal > T1) {
          col = cCoolShadow;
        } else {
          col = cDeepWet;
        }

        // 3. 在每一层色彩分界线处绘制干净平滑的细钢笔分层勾线
        float fw = clamp(fwidth(wallVal), 0.004, 0.026);
        float bandEdge = min(
          min(abs(wallVal - T1), abs(wallVal - T2)),
          min(abs(wallVal - T3), abs(wallVal - T4))
        );
        if (bandEdge < fw * 0.90) {
          col = mix(col, inkCol, 0.88);
        }

        // 4. 混凝土垂直伸缩缝细钢笔线 + 堤顶压石交界勾线
        float seamDist = abs(panelPhase - 0.5);
        float seamDistToEdge = min(panelPhase, 1.0 - panelPhase);
        float fwSeam = clamp(fwidth(panelPhase), 0.002, 0.015);
        if (seamDistToEdge < fwSeam * 0.95 && seamDist > 0.1) {
          col = mix(col, inkCol, 0.78);
        }
        float fwY = clamp(fwidth(vUv.y), 0.002, 0.02);
        if (vUv.y > 1.0 - fwY * 1.4) {
          col = mix(col, inkCol, 0.90);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return sharedSeawallMat;
}


let sharedIslandMat: THREE.ShaderMaterial | null = null;

/**
 * 复刻参考图 1 / 图 2 / 图 3 风格的「色彩分层远山与海岛」ShaderMaterial
 * - 摒弃高饱和草绿色，采用大气透视下的冷钢青 (#3B688C)、深群青暗部 (#193252)、迎光冰青白山脊折面 (#8DBAD4 / #CFE6F2)、山腰灰绿岩脉 (#527574) 以及山麓深松青林带 (#132A40)；
 * - 每一级色块分界处与山脊分水岭均通过 fwidth 屏幕导数绘制锐利的细钢笔轮廓墨线 (#141D2E)，完全对齐参考图 2 & 图 3 的版画折面远山质感。
 */
export function getCityPopIslandMaterial(): THREE.ShaderMaterial {
  if (sharedIslandMat) return sharedIslandMat;

  sharedIslandMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSunset;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;

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

      float fbmMtn(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = p * 2.12 + vec2(19.3, 7.7);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        // Blender 导出 Y-up 后：vLocalPos.y 为海拔高度，vLocalPos.x 为横向延展，vLocalPos.z 为前后景深
        float h = vLocalPos.y;
        float x = vLocalPos.x;
        float z = vLocalPos.z;
        vec3 n = normalize(vWorldNormal);
        vec3 inkCol = mix(vec3(0.08, 0.11, 0.18), vec3(0.133, 0.071, 0.188), uSunset); // #141C2E / #221230

        // 1. 山脚水际线与暖褐海蚀崖岸交界带
        float shoreWave = (noise2D(vec2(x * 0.035, z * 0.035)) - 0.5) * 0.55;
        if (h < 0.55 + shoreWave) {
          gl_FragColor = vec4(mix(vec3(0.95, 0.96, 0.98), vec3(1.00, 0.80, 0.58), uSunset), 1.0);
          return;
        }
        float cliffBandTop = 1.65 + shoreWave + smoothstep(0.32, 0.65, abs(n.x)) * 5.8 * noise2D(vec2(x * 0.04, 1.7));
        if (h < cliffBandTop) {
          vec3 shoreLit = mix(vec3(0.85, 0.69, 0.57), vec3(0.90, 0.64, 0.47), uSunset);
          vec3 shoreShd = mix(vec3(0.62, 0.49, 0.44), vec3(0.45, 0.25, 0.38), uSunset);
          vec3 shoreCol = n.x > 0.15 ? shoreLit : shoreShd;
          if (abs(h - cliffBandTop) < 0.20) shoreCol = inkCol;
          gl_FragColor = vec4(shoreCol, 1.0);
          return;
        }

        // 2. 高低起伏的非周期山麓松林带（随山谷抬升、随峭壁收窄，打破生硬的水平一字形锯齿）
        float macroTreeEnv = 4.2 + fbmMtn(vec2(x * 0.012 + 2.3, z * 0.015)) * 7.8;
        float pineIrregular = (noise2D(vec2(x * 0.42, z * 0.18)) - 0.5) * 1.6
                            + (noise2D(vec2(x * 1.15, z * 0.45)) - 0.5) * 0.85;
        float foothillTop = macroTreeEnv + pineIrregular;
        if (h < foothillTop) {
          float treeShade = step(0.54, fbmMtn(vec2(x * 0.08, h * 0.18)));
          vec3 footDark = mix(vec3(0.08, 0.20, 0.31), vec3(0.118, 0.094, 0.239), uSunset);
          vec3 footLit  = mix(vec3(0.14, 0.29, 0.38), vec3(0.220, 0.145, 0.330), uSunset);
          vec3 footCol = mix(footDark, footLit, treeShade);
          if (abs(h - foothillTop) < 0.26) {
            footCol = inkCol;
          }
          gl_FragColor = vec4(footCol, 1.0);
          return;
        }

        // 3. 远山与海岛的非对称折面岩脉与多分水岭色阶分层（摒弃周期性正弦斜纹，采用多尺度分形山脊场）
        vec3 sunDir = normalize(vec3(0.76, 0.36, -0.52));
        float ndotl = dot(n, sunDir);

        float ridgeFbm = fbmMtn(vec2(x * 0.028 - h * 0.032, h * 0.055 + z * 0.025)) - 0.48;
        float cragSpur = (noise2D(vec2(x * 0.075 + h * 0.06, z * 0.05 - h * 0.04)) - 0.5) * 0.26;
        float lightVal = ndotl * 0.76 + ridgeFbm * 0.62 + cragSpur + clamp((h - 22.0) / 80.0, -0.05, 0.22);

        float isBackRange = smoothstep(-6.0, 14.0, -z + (h - 24.0) * 0.5);
        // 局部暖灰褐岩壁区域与冷青色远山交错，增加山体横向色彩丰富度
        float warmRockZone = smoothstep(0.52, 0.68, fbmMtn(vec2(x * 0.018 + 5.1, h * 0.025)));

        vec3 cShadowNoon  = mix(vec3(0.10, 0.20, 0.32), vec3(0.13, 0.25, 0.42), isBackRange);
        vec3 cMidCoolNoon = mix(vec3(0.16, 0.31, 0.43), vec3(0.22, 0.40, 0.57), isBackRange);
        vec3 cSageMidNoon = mix(
          mix(vec3(0.25, 0.43, 0.48), vec3(0.34, 0.54, 0.68), isBackRange),
          vec3(0.46, 0.54, 0.58),
          warmRockZone * 0.65
        );
        vec3 cSunRibNoon  = mix(
          mix(vec3(0.42, 0.60, 0.65), vec3(0.54, 0.72, 0.84), isBackRange),
          vec3(0.76, 0.72, 0.68),
          warmRockZone * 0.55
        );
        vec3 cSnowTipNoon = vec3(0.79, 0.89, 0.95);

        vec3 cShadow  = mix(cShadowNoon,  mix(vec3(0.141, 0.094, 0.282), vec3(0.180, 0.118, 0.341), isBackRange), uSunset);
        vec3 cMidCool = mix(cMidCoolNoon, mix(vec3(0.302, 0.173, 0.412), vec3(0.369, 0.208, 0.467), isBackRange), uSunset);
        vec3 cSageMid = mix(cSageMidNoon, vec3(0.722, 0.345, 0.447), uSunset);
        vec3 cSunRib  = mix(cSunRibNoon,  vec3(0.949, 0.616, 0.455), uSunset);
        vec3 cSnowTip = mix(cSnowTipNoon, vec3(1.000, 0.847, 0.659), uSunset);

        float fw = clamp(fwidth(lightVal), 0.004, 0.022);

        // 随山脊、沟壑与坡向起伏的雪线/峰顶高光边界（消除生硬的水平直线截断）
        float snowNoise = fbmMtn(vec2(x * 0.032 + 3.7, z * 0.028 - 1.9)) * 12.0
                        + (noise2D(vec2(x * 0.11, z * 0.09)) - 0.5) * 4.5;
        float snowElev = clamp((h - (28.0 + snowNoise)) * 0.065, -0.35, 0.28);
        float snowMetric = lightVal + snowElev;
        float snowFw = clamp(fwidth(snowMetric), 0.004, 0.024);

        vec3 col = cShadow;
        if (snowMetric > 0.56) {
          col = cSnowTip;
        } else if (lightVal > 0.28) {
          col = cSunRib;
        } else if (lightVal > 0.06) {
          col = cSageMid;
        } else if (lightVal > -0.16) {
          col = cMidCool;
        } else {
          col = cShadow;
        }

        // 4. 在每一层色彩分界线处绘制干净平滑的细钢笔勾线
        float lightEdgeNorm = min(
          abs(lightVal - (-0.16)),
          min(abs(lightVal - 0.06), abs(lightVal - 0.28))
        ) / fw;
        float snowEdgeNorm = abs(snowMetric - 0.56) / snowFw;
        float bandEdgeNorm = min(lightEdgeNorm, snowEdgeNorm);
        if (bandEdgeNorm < 0.78) {
          col = mix(col, inkCol, 0.86);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return sharedIslandMat;
}


/**
 * 创建《Yacht World》&《Tasty Jam》风格游艇破浪水面尾迹 GLSL ShaderMaterial
 * 平铺于水面 (PlaneGeometry)，包含：
 * 1. 船首向外翻卷的 V 型蓬松花椰菜状雪白泡沫翼 (Scalloped Kelvin Bow Wake)
 * 2. 浪花内侧的亮天蓝卷浪凹面 (#288EF2) 与深群青船底硬投影 (#002668)
 * 3. 船尾拖曳的断续白色水纹条带与四周飞溅的细碎白色水珠点阵
 */
export function createYachtWakeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
      uFoamWhite: { value: new THREE.Color("#FFFDF8") },
      uCurlCyan: { value: new THREE.Color("#2990F2") },
      uHullShadow: { value: new THREE.Color("#002668") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSunset;
      uniform vec3 uFoamWhite;
      uniform vec3 uCurlCyan;
      uniform vec3 uHullShadow;
      varying vec2 vUv;

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
        // 局部坐标：x in [-1, 1] (左右宽度)，y in [0, 1] (0=船首前方, 0.25=船首, 0.65=船尾, 1.0=远尾迹)
        vec2 p = vec2((vUv.x - 0.5) * 2.0, 1.0 - vUv.y);
        float absX = abs(p.x);

        if (p.y < 0.08 || p.y > 0.98) discard;

        // 1. 船首至船尾的 V 型开尔文破浪包络轨迹
        float wakeProg = clamp((p.y - 0.12) / 0.85, 0.0, 1.0);
        float vCenter = 0.08 + pow(wakeProg, 0.78) * 0.68;

        // 蓬松花椰菜状高速向后翻滚的波浪起伏边缘
        float puff1 = sin(wakeProg * 30.0 - uTime * 15.0 + p.x * 4.0) * 0.058;
        float puff2 = cos(wakeProg * 54.0 - uTime * 22.0) * 0.034;
        float n = noise2D(vec2(absX * 14.0, wakeProg * 26.0 - uTime * 9.5));
        float billow = (n - 0.5) * 0.11 + puff1 + puff2;

        // 破浪主泡沫带宽度随船身向后先增厚再自然收尖渐隐（避免在首尾被常数 wakeProg 阈值平直截断）
        float frontTaper = smoothstep(0.0, 0.16, wakeProg);
        float backTaper = 1.0 - smoothstep(0.45, 0.96, wakeProg);
        float endTaper = frontTaper * backTaper;
        float tailBreakup = noise2D(vec2(absX * 18.0, wakeProg * 14.0 - uTime * 5.5));
        float tipNoise = mix(1.0, 0.45 + 0.95 * tailBreakup, smoothstep(0.45, 0.92, wakeProg));

        float bandHalfW = (0.095 + sin(clamp(wakeProg * 1.3, 0.0, 3.14159)) * 0.085)
                        * pow(endTaper, 0.65)
                        * tipNoise;
        float distToArm = abs(absX - vCenter) + billow * 0.55 * endTaper;
        float bandPresent = smoothstep(0.002, 0.016, bandHalfW);

        // 船尾中央翻滚白沫区 (0.42 < p.y < 0.92)，首尾宽度收尖
        float sternTaper = smoothstep(0.42, 0.54, p.y) * (1.0 - smoothstep(0.72, 0.92, p.y));
        float sternCenterTurb = (1.0 - smoothstep(0.0, max(0.008, vCenter * 0.82 * sternTaper), absX))
                              * smoothstep(0.02, 0.12, sternTaper);
        float sternRibbons = step(0.48, sin(p.x * 34.0 + sin(p.y * 28.0 - uTime * 16.0) * 2.4) * 0.5 + 0.5)
                           * sternCenterTurb;

        // 2. 船底与浪花外沿的深群青水影区（随浪带宽度同步收尖）
        float hullTaper = smoothstep(0.16, 0.24, p.y) * (1.0 - smoothstep(0.56, 0.66, p.y));
        float hullShadowMask = (1.0 - smoothstep(0.14 * hullTaper, max(0.01, 0.28 * hullTaper), absX))
                             * smoothstep(0.02, 0.12, hullTaper);
        float safeBandW = max(bandHalfW, 0.002);
        float outerShadowMask = smoothstep(safeBandW + 0.05 * endTaper, safeBandW, distToArm - 0.03 * endTaper)
                              * step(vCenter, absX)
                              * bandPresent;

        // 3. 主雪白破浪泡沫翼与内侧天蓝卷浪心
        float whiteFoamArm = (1.0 - smoothstep(safeBandW * 0.82, safeBandW, distToArm))
                           * bandPresent;

        // 内侧亮天蓝卷浪弧 (复刻《Yacht World》&《Tasty Jam》浪花里的天蓝色块)
        float cyanHalfW = bandHalfW * 0.65 * smoothstep(0.06, 0.22, wakeProg) * (1.0 - smoothstep(0.50, 0.86, wakeProg));
        float cyanCurlMask = (1.0 - smoothstep(0.0, max(cyanHalfW, 0.002), abs(absX - (vCenter - bandHalfW * 0.35)) + billow * 0.4 * endTaper))
                           * smoothstep(0.004, 0.018, cyanHalfW);

        // 4. 浪花外侧飞溅的离散白色水滴点阵 (Spray Droplets)
        vec2 dropGrid = floor(vec2(p.x * 36.0, p.y * 52.0 - uTime * 3.0));
        float dropRnd = hash21(dropGrid);
        float dropZone = (1.0 - smoothstep(safeBandW, safeBandW + 0.14 * endTaper, distToArm))
                       * step(safeBandW * 0.85, distToArm)
                       * bandPresent;
        float sprayDots = step(0.84, dropRnd) * dropZone;

        // 合成颜色与透明度（sunset 染色：金桃色浪花 + 玫瑰珊瑚卷浪 + 深紫靛阴影）
        vec3 foamWhiteCol = mix(uFoamWhite, vec3(1.000, 0.886, 0.722), uSunset);
        vec3 curlCyanCol  = mix(uCurlCyan,  vec3(0.851, 0.408, 0.486), uSunset);
        vec3 hullShdCol   = mix(uHullShadow,vec3(0.133, 0.098, 0.302), uSunset);

        float totalAlpha = 0.0;
        vec3 finalCol = hullShdCol;

        if (hullShadowMask > 0.2 || outerShadowMask > 0.25) {
          finalCol = hullShdCol;
          totalAlpha = max(hullShadowMask, outerShadowMask) * 0.85;
        }
        if (cyanCurlMask > 0.35) {
          finalCol = curlCyanCol;
          totalAlpha = 0.95;
        }
        if (whiteFoamArm > 0.35 || sternRibbons > 0.45 || sprayDots > 0.5) {
          finalCol = foamWhiteCol;
          // 泡沫内部点缀少量水纹凹槽
          if (n > 0.74 && whiteFoamArm > 0.6) {
            finalCol = curlCyanCol;
          }
          totalAlpha = 0.98;
        }

        if (totalAlpha < 0.1) discard;
        gl_FragColor = vec4(finalCol, totalAlpha);
      }
    `,
  });
}

const celLitMatCache = new Map<string, THREE.MeshToonMaterial>();

/**
 * 创建带铃木英人式 4 阶硬边色温分层光影 + 色层交界细墨线的通用程序化网格材质
 * 供路边立柱招牌 (RoadsidePylonSign)、跨海系杆拱桥 (CoastalTiedArchBridge)、防波堤等程序化几何体统一使用
 */
export function getCityPopCelLitMaterial(hexColor: string): THREE.MeshToonMaterial {
  const existing = celLitMatCache.get(hexColor);
  if (existing) return existing;

  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(hexColor),
    gradientMap: getCityPopGradientMap(),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunset = CITYPOP_THEME_UNIFORMS.uSunset;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\nuniform float uSunset;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      /* glsl */ `
        vec3 nV = normalize(vNormal);
        float rawSun = dot(nV, normalize(vec3(-0.55, 0.68, 0.48))) * 0.5 + 0.5;
        float spatialWave = sin(vViewPosition.x * 0.55 - vViewPosition.y * 0.72) * 0.16;
        float sunBand = clamp(rawSun * 0.84 + spatialWave + 0.08, 0.0, 1.0);
        float fwB = clamp(fwidth(sunBand), 0.004, 0.045);

        vec3 tintBand = vec3(1.0);
        if (sunBand < 0.30) {
          tintBand = mix(vec3(0.32, 0.48, 0.84), vec3(0.36, 0.24, 0.56), uSunset); // 群青冷调 / 日落暮紫暗部
        } else if (sunBand < 0.56) {
          tintBand = mix(vec3(0.64, 0.84, 0.98), vec3(0.76, 0.46, 0.62), uSunset); // 天青冷调 / 日落玫瑰灰过渡面
        } else if (sunBand < 0.78) {
          tintBand = mix(vec3(0.98, 0.96, 0.93), vec3(1.12, 0.78, 0.58), uSunset); // 暖阳主受光面 / 琥珀珊瑚日落光
        } else {
          tintBand = mix(vec3(1.10, 1.07, 1.02), vec3(1.24, 0.94, 0.72), uSunset); // 明快高光面 / 蜜桃金高光
        }

        float distEdge = min(
          min(abs(sunBand - 0.30), abs(sunBand - 0.56)),
          abs(sunBand - 0.78)
        );
        if (distEdge < fwB * 0.75) {
          tintBand *= 0.28; // 色层交界处的细钢笔勾线
        }

        outgoingLight = diffuseColor.rgb * tintBand;
        #include <opaque_fragment>
      `
    );
  };

  applyCityPopDistanceFade(mat);
  celLitMatCache.set(hexColor, mat);
  return mat;
}

let sharedYacht3DSplashMat: THREE.ShaderMaterial | null = null;

/**
 * 基于行进噪波场 (Travelling FBM Noise) 驱动的 3D 游艇翻卷浪冠着色器材质：
 * 1. 顶点着色器：利用三维流动噪声在曲面上实时置换法线隆起、翻卷弧度与波峰起伏，船首分水点保持锚定不脱离
 * 2. 片元着色器：利用多倍频噪波实时雕刻花椰菜状翻滚泡沫上沿、尾部脱离飞溅水珠、三阶色彩分层（深钴蓝底影 -> 亮天青卷浪心 -> 雪白浪冠）与恒定屏幕像素宽度钢笔墨线
 */
export function getYacht3DSplashMaterial(): THREE.ShaderMaterial {
  if (sharedYacht3DSplashMat) return sharedYacht3DSplashMat;

  sharedYacht3DSplashMat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunset: CITYPOP_THEME_UNIFORMS.uSunset,
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vWaveUv;
      varying vec3 vWorldNormal;
      varying float vDispNoise;

      float hash31(vec3 p) {
        p = fract(p * vec3(127.1, 311.7, 74.7));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), u.x),
            mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), u.x),
            u.y
          ),
          mix(
            mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), u.x),
            mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), u.x),
            u.y
          ),
          u.z
        );
      }

      void main() {
        // u: 0 (船首) -> 1 (船尾), v: 0 (水线) -> 1 (浪冠卷尖)
        float u = uv.x;
        float v = 1.0 - uv.y;
        vWaveUv = vec2(u, v);

        // 船首 (u -> 0) 平滑收敛锚定在船头，中段与尾段随行进噪波剧烈翻涌
        float bowPin = smoothstep(0.0, 0.08, u);
        float waveEnv = bowPin * (1.0 - u * 0.25);

        // 沿船首向船尾 (-Z / +u) 高速流动的两层三维噪波
        vec3 flowP1 = vec3(position.x * 0.75, v * 2.2, u * 6.5 - uTime * 2.8);
        vec3 flowP2 = vec3(position.x * 1.45, v * 4.0 - uTime * 1.6, u * 13.0 - uTime * 5.2);
        float n1 = noise3D(flowP1) * 2.0 - 1.0;
        float n2 = noise3D(flowP2) * 2.0 - 1.0;
        float combinedN = n1 * 0.65 + n2 * 0.35;
        vDispNoise = combinedN;

        vec3 pos = position;
        // 1. 沿曲面法线方向产生蓬松花椰菜状翻滚鼓包置换
        pos += normal * (combinedN * 0.38) * waveEnv * (0.25 + v * 0.75);
        // 2. 浪冠纵向行进波浪起伏与向外翻卷喷溅动态
        float travelWave = sin(u * 18.0 - uTime * 8.5 + n1 * 2.2);
        pos.y += (travelWave * 0.22 + n2 * 0.14) * waveEnv * v;
        pos.x += sign(pos.x) * (combinedN * 0.28 + travelWave * 0.15) * waveEnv * pow(v, 0.85);

        vWorldNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSunset;
      varying vec2 vWaveUv;
      varying vec3 vWorldNormal;
      varying float vDispNoise;

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

      float fbm2D(vec2 p) {
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < 4; i++) {
          v += a * noise2D(p);
          p = p * 2.15 + vec2(17.3, 9.2);
          a *= 0.48;
        }
        return v;
      }

      // 尖锐湍流脊噪波 (Ridged Turbulence)，用于撕裂平缓的蓝白分界线，制造北斋/铃木英人式犬牙交错的激浪爪尖与泡沫孔洞
      float ridgedTurb(vec2 p) {
        float v = 0.0;
        float a = 0.54;
        for (int i = 0; i < 4; i++) {
          float n = 1.0 - abs(noise2D(p) * 2.0 - 1.0);
          v += a * (n * n);
          p = p * 2.28 + vec2(31.7, 13.9);
          a *= 0.50;
        }
        return v;
      }

      void main() {
        float u = vWaveUv.x;
        float v = vWaveUv.y;

        // Domain-Warped 域扭曲激流坐标：高速斜向撕裂与翻卷涡旋
        vec2 baseFlow = vec2(u * 10.5 - uTime * 3.8, v * 5.8 - uTime * 1.4);
        vec2 warp = vec2(
          fbm2D(baseFlow + vec2(1.7, 9.2)) - 0.5,
          fbm2D(baseFlow + vec2(8.3, 2.8)) - 0.5
        );
        vec2 turbUv = baseFlow + warp * 1.15;

        float fbm = fbm2D(turbUv);
        float ridge = ridgedTurb(vec2(u * 16.0 - v * 7.5 - uTime * 5.4, v * 12.5 - uTime * 2.6) + warp * 1.4);
        float clawFingers = ridgedTurb(vec2(u * 28.0 - v * 16.0 - uTime * 7.8, v * 22.0 + u * 8.0 - uTime * 3.5));
        float fineSpray = noise2D(vec2(u * 42.0 - uTime * 9.5, v * 32.0 - uTime * 4.2) + warp * 2.2);

        // 1. 激烈撕裂的锯齿状爪浪上沿与飞溅水花团 (Jagged Claw Crest & Shattered Spray)
        float baseArch = sin(clamp(pow(u, 0.65), 0.0, 1.0) * 3.14159) * (1.0 - u * 0.22);
        float jaggedCrest = (ridge - 0.42) * 0.52 + (clawFingers - 0.45) * 0.34 + (fbm - 0.45) * 0.28 + vDispNoise * 0.18;
        float maxV = clamp(0.34 + baseArch * 0.60 + jaggedCrest, 0.14, 0.98);
        float minV = 0.01 + (1.0 - ridge) * 0.18 * smoothstep(0.55, 0.98, u);

        // 主体翻卷浪花距离场
        float mainWaveField = min(maxV - v, v - minV) * (1.0 - smoothstep(0.88, 0.99, u));

        // 浪冠上方剧烈炸开的钩状飞沫水珠簇与碎浪舌
        float sprayZone = (1.0 - abs(v - (maxV + 0.09)) / 0.18) * smoothstep(0.04, 0.15, u) * (1.0 - smoothstep(0.82, 0.97, u));
        float sprayLobes = (clawFingers * 0.55 + fineSpray * 0.45) * sprayZone - 0.34;

        float shapeField = max(mainWaveField, sprayLobes);
        if (shapeField < 0.0) discard;

        float fwShape = clamp(fwidth(shapeField), 0.005, 0.032);

        // 2. 激烈犬牙交错的蓝白泡沫撕裂分界场（彻底打破平滑水平色带，让天青/深蓝浪爪向上刺入白沫、白沫向下碎裂成泡沫网孔）
        float normV = v / max(0.20, maxV);
        float foamVal = normV * 0.58
          + (ridge - 0.42) * 0.68
          + (clawFingers - 0.45) * 0.52
          + (fineSpray - 0.48) * 0.32
          + vDispNoise * 0.18;

        // 在白浪层内部镂刻出剧烈翻滚的网状深蓝/天青水花破孔 (Shattered Foam Web Pockets)
        float splashHole = step(0.74, clawFingers) * step(0.62, fineSpray) * smoothstep(0.88, 0.38, normV);
        foamVal -= splashHole * 0.38;
        // 在下层蓝浪中炸出飞溅的雪白泡沫飞沫点
        float whiteSplatter = step(0.76, ridge) * step(0.68, fineSpray) * smoothstep(0.10, 0.45, normV);
        foamVal += whiteSplatter * 0.42;

        float fwFoam = clamp(fwidth(foamVal), 0.006, 0.038);

        vec3 colDeepCobalt = mix(vec3(0.075, 0.320, 0.810), vec3(0.133, 0.098, 0.302), uSunset); // #1352CF / #22194D
        vec3 colCurlCyan   = mix(vec3(0.180, 0.720, 1.000), vec3(0.851, 0.408, 0.486), uSunset); // #2EB8FF / #D9687C
        vec3 colFoamWhite  = mix(vec3(1.000, 0.992, 0.972), vec3(1.000, 0.886, 0.722), uSunset); // #FFFDF8 / #FFE2B8
        vec3 colSunCream   = mix(vec3(1.000, 0.984, 0.930), vec3(1.000, 0.949, 0.839), uSunset); // #FFFBED / #FFF2D6
        vec3 inkCol        = mix(vec3(0.063, 0.075, 0.110), vec3(0.125, 0.071, 0.188), uSunset); // #10131C / #201230

        vec3 col = colFoamWhite;
        if (foamVal < 0.30) {
          col = colDeepCobalt;
        } else if (foamVal < 0.56) {
          col = colCurlCyan;
        } else if (foamVal < 0.84) {
          col = colFoamWhite;
        } else {
          col = colSunCream;
        }

        // 飞溅脱离的小水珠呈现雪白与天青交错
        if (mainWaveField < 0.0 && sprayLobes >= 0.0) {
          col = fineSpray > 0.48 ? colFoamWhite : colCurlCyan;
        }

        // 3. 外轮廓钢笔描边 + 内部犬牙交错蓝白撕裂线处的清晰钢笔墨线勾勒
        bool isOuterInk = shapeField < fwShape * 1.18;
        float distBand = min(abs(foamVal - 0.30), min(abs(foamVal - 0.56), abs(foamVal - 0.84)));
        bool isInnerInk = distBand < fwFoam * 0.65;

        if (isOuterInk || isInnerInk) {
          col = mix(col, inkCol, isOuterInk ? 0.90 : 0.72);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  return sharedYacht3DSplashMat;
}

let sharedPalmShadowTex: THREE.CanvasTexture | null = null;

/**
 * 生成 City Pop 插画风格的棕榈树地面硬边投影贴图
 * - 摒弃生硬黑圆+长方形木棍，改为半透明冷群青蓝色 (#0B2D6E) 投射在珊瑚粉人行道与浅色路面上（透出地砖纹理）
 * - 包含树干根部收敛触地影、微弯渐细的修长树干投影，以及顶端放射状羽状树冠叶影
 */
export function getCityPopPalmShadowTexture(): THREE.CanvasTexture {
  if (sharedPalmShadowTex) return sharedPalmShadowTex;

  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, w, h);

  // 半透明冷靛蓝投影（透出下方路面标线与人行道地砖纹理）
  ctx.fillStyle = "rgba(15, 38, 86, 0.36)";

  // 1. 树干根部紧凑接触影
  const rootX = 474;
  const rootY = 128;
  ctx.beginPath();
  ctx.ellipse(rootX, rootY, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. 修长微弯且逐渐收细的树干投影
  const crownX = 118;
  const crownY = 128;
  ctx.beginPath();
  ctx.moveTo(rootX, rootY - 6);
  ctx.quadraticCurveTo(296, rootY - 9, crownX, crownY - 3.5);
  ctx.lineTo(crownX, crownY + 3.5);
  ctx.quadraticCurveTo(296, rootY + 1, rootX, rootY + 6);
  ctx.closePath();
  ctx.fill();

  // 3. 树冠顶部自然放射状羽叶投影（纤细弯曲叶轴 + 舒展 V 型羽片，避免臃肿椭圆块）
  const frondSpecs = [
    { ang: -2.88, len: 86, curve: -14 },
    { ang: -2.32, len: 96, curve: -12 },
    { ang: -1.72, len: 88, curve: -9 },
    { ang: -1.12, len: 80, curve: -6 },
    { ang: -0.52, len: 70, curve: 8 },
    { ang: 0.48, len: 68, curve: -8 },
    { ang: 1.08, len: 82, curve: 8 },
    { ang: 1.68, len: 90, curve: 11 },
    { ang: 2.28, len: 98, curve: 14 },
    { ang: 2.82, len: 90, curve: 11 },
    { ang: 3.12, len: 102, curve: 4 },
  ];

  for (const f of frondSpecs) {
    ctx.save();
    ctx.translate(crownX, crownY);
    ctx.rotate(f.ang);

    ctx.beginPath();
    ctx.moveTo(0, -2.2);
    ctx.quadraticCurveTo(f.len * 0.52, f.curve * 0.5 - 2, f.len, f.curve);
    ctx.quadraticCurveTo(f.len * 0.52, f.curve * 0.5 + 2, 0, 2.2);
    ctx.closePath();
    ctx.fill();

    const leaflets = 11;
    for (let k = 2; k <= leaflets; k++) {
      const t = k / (leaflets + 1);
      const lx = f.len * t;
      const ly = f.curve * t * t;
      const span = Math.sin(t * Math.PI) * 16 + 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(lx - 2.5, ly);
        ctx.lineTo(lx + 7.5, ly + side * span);
        ctx.lineTo(lx + 2.5, ly);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.ellipse(crownX, crownY, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  sharedPalmShadowTex = tex;
  return tex;
}
