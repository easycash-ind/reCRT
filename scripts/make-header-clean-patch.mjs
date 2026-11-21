import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const basePath = path.join(root, "src/assets/tactile-login/base_console.webp");
const outPath = path.join(
  root,
  "src/assets/tactile-login/header_brand_clean.webp"
);
const previewPath = path.join(
  root,
  "src/assets/tactile-login/_preview_header.png"
);

// 整个补丁切片在 1024×1024 底图上的坐标范围
const PATCH = { left: 216, top: 172, width: 422, height: 82 };

const { data: fullData, info: fullInfo } = await sharp(basePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = fullInfo.width;
const C = fullInfo.channels;

function getPixel(x, y) {
  const idx = (y * W + x) * C;
  return [
    fullData[idx],
    fullData[idx + 1],
    fullData[idx + 2],
    fullData[idx + 3],
  ];
}

const work = Buffer.from(fullData);
function setWorkPixel(x, y, r, g, b, a = 255) {
  const idx = (y * W + x) * C;
  work[idx] = Math.max(0, Math.min(255, Math.round(r)));
  work[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
  work[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
  work[idx + 3] = Math.max(0, Math.min(255, Math.round(a)));
}

// 无周期条纹的 2D 哈希伪随机（[-1, 1]）
function hash2d(x, y, seed = 1) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = h ^ (h >> 16);
  return ((h & 0xffff) / 32767.5) - 1.0;
}

// ============================================================================
// 1. 修复左侧圆角方形 Logo 凹槽内部（擦除月亮星星图标，100% 保留物理凹槽倒角边框）
// 凹槽外框 x: 218..285, y: 178..245；内部月亮图标仅在 x: 229..272, y: 194..233
// y <= 192 与 y >= 235 原图本来就是完全干净的凹槽圆角顶/底边，无需触碰！
// ============================================================================
const WELL = { x0: 227, y0: 189, x1: 275, y1: 235 };

function sampleCleanStripV(x, yCenter) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    // 严格限制采样纵坐标在笔直侧壁内部 [195, 231]，避开上下圆角外侧的亮银色面板像素
    const cy = Math.max(195, Math.min(231, yCenter + dy));
    const [r, g, b] = getPixel(x, cy);
    sr += r; sg += g; sb += b; n++;
  }
  return [sr / n, sg / n, sb / n];
}

for (let y = WELL.y0; y <= WELL.y1; y++) {
  // 在 y=193..234 区间属于凹槽笔直侧边内部，x=225 与 x=277 完全位于凹槽内部干净底面上
  const leftCol = sampleCleanStripV(225, y);
  const rightCol = sampleCleanStripV(277, y);

  for (let x = WELL.x0; x <= WELL.x1; x++) {
    const tx = (x - WELL.x0) / (WELL.x1 - WELL.x0);

    const baseR = (1 - tx) * leftCol[0] + tx * rightCol[0];
    const baseG = (1 - tx) * leftCol[1] + tx * rightCol[1];
    const baseB = (1 - tx) * leftCol[2] + tx * rightCol[2];

    // 凹槽底面极其细腻的磨砂颗粒
    const gMono = hash2d(x, y, 11) * 1.4 + hash2d(x + 7, y - 3, 29) * 0.8;

    const edgeDist = Math.min(
      x - WELL.x0,
      WELL.x1 - x,
      y - WELL.y0,
      WELL.y1 - y
    );
    const blend = Math.min(1, Math.max(0, (edgeDist + 1) / 3));
    const orig = getPixel(x, y);

    setWorkPixel(
      x,
      y,
      orig[0] * (1 - blend) + (baseR + gMono) * blend,
      orig[1] * (1 - blend) + (baseG + gMono) * blend,
      orig[2] * (1 - blend) + (baseB + gMono) * blend,
      255
    );
  }
}

// ============================================================================
// 2. 修复右侧主标题 + 副标题文字区域（x: 338..634, y: 175..251）
// 文字实际范围：x: 344..624, y: 184..241，外扩 7~9px 确保羽化区 100% 落在干净金属上
// ============================================================================
const TEXT_BOX = { x0: 338, y0: 175, x1: 634, y1: 251 };

function localMean(cx, cy, rx = 8, ry = 2) {
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const [r, g, b] = getPixel(cx + dx, cy + dy);
      sr += r; sg += g; sb += b; n++;
    }
  }
  return [sr / n, sg / n, sb / n];
}

for (let y = TEXT_BOX.y0; y <= TEXT_BOX.y1; y++) {
  const ty = (y - TEXT_BOX.y0) / (TEXT_BOX.y1 - TEXT_BOX.y0);
  const dy = y - TEXT_BOX.y0;

  for (let x = TEXT_BOX.x0; x <= TEXT_BOX.x1; x++) {
    // 严格从文字框外侧干净金属带 (y=172 与 y=254) 取样低频光照渐变
    const topMean = localMean(x, TEXT_BOX.y0 - 3, 8, 2);
    const botMean = localMean(x, TEXT_BOX.y1 + 3, 8, 2);

    const lowR = (1 - ty) * topMean[0] + ty * botMean[0];
    const lowG = (1 - ty) * topMean[1] + ty * botMean[1];
    const lowB = (1 - ty) * topMean[2] + ty * botMean[2];

    // 从上方干净金属区 (y=138..172) 和下方干净金属区 (y=252..266) 混合采样 1:1 真实拉丝颗粒
    // 加上横向偏移避免上下镜像对称伪影
    const srcY1 = 138 + (dy % 33);
    const srcX1 = 340 + ((x - 340 + Math.floor(dy / 33) * 73) % 285);
    const srcPix1 = getPixel(srcX1, srcY1);
    const srcMean1 = localMean(srcX1, srcY1, 6, 2);

    const srcY2 = 252 + ((dy + 11) % 14);
    const srcX2 = 340 + ((x - 340 + 137) % 285);
    const srcPix2 = getPixel(srcX2, srcY2);
    const srcMean2 = localMean(srcX2, srcY2, 6, 2);

    const hfR = (srcPix1[0] - srcMean1[0]) * 0.72 + (srcPix2[0] - srcMean2[0]) * 0.68;
    const hfG = (srcPix1[1] - srcMean1[1]) * 0.72 + (srcPix2[1] - srcMean2[1]) * 0.68;
    const hfB = (srcPix1[2] - srcMean1[2]) * 0.72 + (srcPix2[2] - srcMean2[2]) * 0.68;

    const synthR = lowR + hfR;
    const synthG = lowG + hfG;
    const synthB = lowB + hfB;

    const edgeDist = Math.min(
      x - TEXT_BOX.x0,
      TEXT_BOX.x1 - x,
      y - TEXT_BOX.y0,
      TEXT_BOX.y1 - y
    );
    const blend = Math.min(1, Math.max(0, (edgeDist + 1) / 6));
    const orig = getPixel(x, y);

    setWorkPixel(
      x,
      y,
      orig[0] * (1 - blend) + synthR * blend,
      orig[1] * (1 - blend) + synthG * blend,
      orig[2] * (1 - blend) + synthB * blend,
      255
    );
  }
}

// 导出 PATCH 切片（四周带 5px Alpha 柔化）
const patchBuf = Buffer.alloc(PATCH.width * PATCH.height * 4);
const feather = 5;
for (let py = 0; py < PATCH.height; py++) {
  for (let px = 0; px < PATCH.width; px++) {
    const gx = PATCH.left + px;
    const gy = PATCH.top + py;
    const srcIdx = (gy * W + gx) * C;
    const dstIdx = (py * PATCH.width + px) * 4;

    const dx = Math.min(px, PATCH.width - 1 - px);
    const dy = Math.min(py, PATCH.height - 1 - py);
    const d = Math.min(dx, dy);
    const alpha =
      d >= feather ? 255 : Math.round((255 * (d + 1)) / (feather + 1));

    patchBuf[dstIdx] = work[srcIdx];
    patchBuf[dstIdx + 1] = work[srcIdx + 1];
    patchBuf[dstIdx + 2] = work[srcIdx + 2];
    patchBuf[dstIdx + 3] = alpha;
  }
}

await sharp(patchBuf, {
  raw: { width: PATCH.width, height: PATCH.height, channels: 4 },
})
  .webp({ quality: 96, alphaQuality: 100 })
  .toFile(outPath);

await sharp(work, { raw: { width: W, height: fullInfo.height, channels: C } })
  .extract({ left: 140, top: 120, width: 620, height: 155 })
  .png()
  .toFile(previewPath);

console.log("wrote", outPath);
console.log("PATCH %:", {
  left: ((PATCH.left / 1024) * 100).toFixed(3) + "%",
  top: ((PATCH.top / 1024) * 100).toFixed(3) + "%",
  width: ((PATCH.width / 1024) * 100).toFixed(3) + "%",
  height: ((PATCH.height / 1024) * 100).toFixed(3) + "%",
});
