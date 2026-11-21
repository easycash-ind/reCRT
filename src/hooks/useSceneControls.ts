import { useControls, folder } from "leva";

const ELEMENT_NAMES: Record<string, string> = {
  "top-left": "Video (左上)",
  "top-right": "Script (右上)",
  "bottom-left": "ImgAgent (左下)",
  "bottom-right": "SEO (右下)",
};

const DEFAULTS = {
  "top-left": { x: -2.9, y: 1.8, z: -0.1, scale: 1.55, floatAmp: 0.06, rotX: -0.35, rotY: -0.19, rotZ: -0.31 },
  "top-right": { x: 2.6, y: 1.8, z: 0.3, scale: 1.3, floatAmp: 0.06, rotX: -0.27, rotY: -0.04, rotZ: 0.36 },
  "bottom-left": { x: -2.4, y: -1.6, z: 0.2, scale: 1.45, floatAmp: 0.06, rotX: -0.42, rotY: 0.19, rotZ: 0.54 },
  "bottom-right": { x: 2.6, y: -1.2, z: -0.3, scale: 1.35, floatAmp: 0.06, rotX: -0.28, rotY: -0.66, rotZ: -0.19 },
};

const PI = Math.PI;

export const TONE_MAPPING_OPTIONS: Record<string, number> = {
  "无 (No)": 0,         // NoToneMapping
  "线性 (Linear)": 1,   // LinearToneMapping
  "Reinhard": 2,         // ReinhardToneMapping
  "Cineon": 3,           // CineonToneMapping
  "ACES": 4,             // ACESFilmicToneMapping
  "AgX": 6,              // AgXToneMapping
  "Neutral": 7,          // NeutralToneMapping
};

export function useSidebarControls() {
  return useControls("侧边详情栏", {
    宽度: { value: 420, min: 200, max: 500, step: 10 },
    内边距: folder({
      上: { value: 48, min: 0, max: 60, step: 2 },
      右: { value: 60, min: 0, max: 60, step: 2 },
      下: { value: 28, min: 0, max: 60, step: 2 },
      左: { value: 46, min: 0, max: 60, step: 2 },
    }, { collapsed: true }),
    背景模糊度: { value: 2, min: 0, max: 30, step: 1 },
    起始颜色: "#001347",
    起始不透明度: { value: 0.85, min: 0, max: 1, step: 0.05 },
    结束颜色: "#000f57",
    结束不透明度: { value: 0, min: 0, max: 1, step: 0.05 },
    标题正文颜色: "#ffffff",
    次要文字颜色: "#9c9c9c",
  }, { collapsed: true });
}

export function useNavbarControls() {
  return useControls("导航栏", {
    导航栏颜色: "#ffffff",
    字体颜色: "#ffffff",
    不透明度: { value: 0.15, min: 0, max: 1, step: 0.05 },
    背景模糊度: { value: 10, min: 0, max: 30, step: 1 },
    内容宽度: { value: 1000, min: 400, max: 1400, step: 10 },
    按钮间距: { value: 12, min: 0, max: 40, step: 1 },
    按钮内边距: folder({
      上: { value: 6, min: 0, max: 30, step: 1 },
      右: { value: 16, min: 0, max: 40, step: 1 },
      下: { value: 6, min: 0, max: 30, step: 1 },
      左: { value: 16, min: 0, max: 40, step: 1 },
    }, { collapsed: true }),
  }, { collapsed: true });
}

export function useGlobalControls() {
  return useControls("全局", {
    背景色1: "#003ee3",
    背景色2: "#010d61",
    Center大小: { value: 2.15, min: 0.1, max: 5, step: 0.05 },
    摄像机距离: { value: 12, min: 5, max: 30, step: 0.5 },
    摄像机水平偏移: { value: 4, min: -10, max: 10, step: 0.1 },
    灯光: false,
    色调映射: { value: "ACES", options: Object.keys(TONE_MAPPING_OPTIONS) },
    曝光: { value: 1.0, min: 0.1, max: 5, step: 0.05 },
  }, { collapsed: false });
}

export function useHdrControls() {
  return useControls("HDR 环境", {
    亮度: { value: 1.1, min: 0, max: 3, step: 0.05 },
    旋转: { value: 3.23, min: 0, max: PI * 2, step: 0.01 },
  }, { collapsed: true });
}

export function useGridControls() {
  return useControls("背景网格", {
    网格尺寸: { value: 17, min: 5, max: 60, step: 1 },
    描边粗细: { value: 0.015, min: 0.005, max: 0.1, step: 0.005 },
    描边不透明度: { value: 0.05, min: 0, max: 1, step: 0.05 },
    网格描边色: "#ffffff",
    光圈颜色: "#bce1ff",
    光圈不透明度: { value: 0.45, min: 0, max: 1, step: 0.05 },
    光圈大小: { value: 0.08, min: 0.05, max: 1.0, step: 0.01 },
    光圈模糊度: { value: 0.18, min: 0.0, max: 0.5, step: 0.01 },
  }, { collapsed: true });
}

export function usePostFxControls() {
  return useControls("渲染效果", {
    光晕: folder({
      光晕开关: true,
      光晕强度: { value: 1.55, min: 0, max: 2, step: 0.05 },
      光晕阈值: { value: 0.95, min: 0, max: 1, step: 0.05 },
    }, { collapsed: true }),
    暗角: folder({
      暗角开关: true,
      暗角偏移: { value: 0.25, min: 0, max: 1, step: 0.05 },
      暗角强度VIG: { value: 0.8, min: 0, max: 1, step: 0.05, label: "暗角强度" },
    }, { collapsed: true }),
    色差: folder({
      色差开关: false,
      色差偏移: { value: 0.003, min: 0, max: 0.02, step: 0.001 },
    }, { collapsed: true }),
  }, { collapsed: true });
}

export function useIconGlowControls() {
  return useControls("Icon 发光", {
    发光颜色: "#ffffff",
    发光强度: { value: 0.4, min: 0, max: 5, step: 0.05 },
    过渡速度: { value: 0.11, min: 0.01, max: 0.3, step: 0.01 },
  }, { collapsed: true });
}

export function useDecorationControls() {
  return useControls("装饰模型", {
    数量: { value: 7, min: 0, max: 100, step: 1 },
    随机种子: { value: 930, min: 0, max: 9999, step: 1 },
    大小范围: folder({
      最小: { value: 0.4, min: 0.05, max: 3, step: 0.05 },
      最大: { value: 1.1, min: 0.05, max: 3, step: 0.05 },
    }, { collapsed: true }),
    旋转范围: folder({
      旋转最小: { value: -PI, min: -PI, max: PI, step: 0.01, label: "最小" },
      旋转最大: { value: PI, min: -PI, max: PI, step: 0.01, label: "最大" },
    }, { collapsed: true }),
    空间范围: folder({
      X: { value: 23.5, min: 1, max: 30, step: 0.5 },
      Y: { value: 7, min: 1, max: 30, step: 0.5 },
      Z: { value: 1, min: 1, max: 30, step: 0.5 },
    }, { collapsed: true }),
  }, { collapsed: true });
}

export function useRotationControls() {
  return useControls("周围模型旋转", {
    旋转速度: { value: 1.0, min: 0, max: 3, step: 0.05 },
    "旋转幅度(°)": { value: 10, min: 0, max: 20, step: 0.5 },
  }, { collapsed: true });
}

export function useElementControls(id: string) {
  const name = ELEMENT_NAMES[id] ?? id;
  const d = DEFAULTS[id as keyof typeof DEFAULTS];

  return useControls(name, {
    位置: folder({
      x: { value: d.x, min: -8, max: 8, step: 0.1 },
      y: { value: d.y, min: -6, max: 6, step: 0.1 },
      z: { value: d.z, min: -4, max: 4, step: 0.1 },
    }, { collapsed: true }),
    初始旋转: folder({
      rotX: { value: d.rotX, min: -PI, max: PI, step: 0.01, label: "X" },
      rotY: { value: d.rotY, min: -PI, max: PI, step: 0.01, label: "Y" },
      rotZ: { value: d.rotZ, min: -PI, max: PI, step: 0.01, label: "Z" },
    }, { collapsed: true }),
    大小: { value: d.scale, min: 0.1, max: 4, step: 0.05 },
    位移幅度: { value: d.floatAmp, min: 0, max: 0.5, step: 0.01 },
  }, { collapsed: true });
}
