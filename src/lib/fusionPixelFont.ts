import fusionPixelUrl from "../assets/fonts/fusion-pixel.ttf?url";

const FAMILY = "Fusion Pixel";
let loadPromise: Promise<void> | null = null;

/** 通过 Vite 资源 URL 强制注册像素字体，避免 CSS @font-face 路径未生效 */
export function ensureFusionPixelFont(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (document.fonts.check(`12px "${FAMILY}"`)) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const face = new FontFace(FAMILY, `url(${fusionPixelUrl})`, {
      style: "normal",
      weight: "400",
      display: "block",
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
    await document.fonts.load(`12px "${FAMILY}"`);
  })().catch((err) => {
    loadPromise = null;
    console.warn("[fusion-pixel] font load failed:", err);
    throw err;
  });

  return loadPromise;
}

export const FUSION_PIXEL_FAMILY = FAMILY;
