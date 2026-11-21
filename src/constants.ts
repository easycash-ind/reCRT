import type { FloatingElementConfig } from "./types";

export const FLOATING_ELEMENTS: FloatingElementConfig[] = [
  {
    id: "top-left",
    glbUrl: "/video.glb",
    position: [-3.5, 2.2, -0.5],
    scale: 1.1,
    color: "#C59DBE",
    phaseOffset: 0,
    rotationSpeed: [0.15, 0.2, 0.05],
  },
  {
    id: "top-right",
    glbUrl: "/script.glb",
    position: [3.8, 1.8, 0.3],
    scale: 0.95,
    color: "#FEB434",
    phaseOffset: 1.5,
    rotationSpeed: [0.1, -0.15, 0.12],
  },
  {
    id: "bottom-left",
    glbUrl: "/ImgAgent.glb",
    position: [-3.2, -2.0, 0.2],
    scale: 1.2,
    color: "#7696FF",
    phaseOffset: 3.0,
    rotationSpeed: [-0.12, 0.1, 0.18],
  },
  {
    id: "bottom-right",
    glbUrl: "/seo.glb",
    position: [3.4, -2.4, -0.3],
    scale: 1.0,
    color: "#378BFF",
    phaseOffset: 4.5,
    rotationSpeed: [0.08, -0.2, -0.1],
  },
];

export const MOUSE_FOLLOW_LERP_FACTOR = 0.05;
export const MAX_ROTATION_ANGLE = Math.PI / 6;
export const FLOAT_SPEED = 0.6;

export const LOGIN_SCENE_GLOBAL = {
  backgroundTop: "#003ee3",
  backgroundBottom: "#010d61",
  centerScale: 2.15,
  cameraDistance: 12,
  cameraOffsetX: 4,
  lights: false,
  toneMapping: "ACES",
  exposure: 1,
} as const;

export const LOGIN_SCENE_HDR = {
  intensity: 1.1,
  rotation: 3.23,
} as const;

export const LOGIN_SCENE_GRID = {
  size: 17,
  lineWidth: 0.015,
  lineOpacity: 0.05,
  color: "#ffffff",
  glowColor: "#bce1ff",
  glowOpacity: 0.45,
  glowRadius: 0.08,
  glowBlur: 0.18,
} as const;

export const LOGIN_SCENE_ROTATION = {
  speed: 1,
  maxAngleDegrees: 10,
} as const;

export const LOGIN_SCENE_GLOW = {
  发光颜色: "#ffffff",
  发光强度: 0.4,
  过渡速度: 0.11,
} as const;

export const LOGIN_SCENE_ELEMENTS: Record<string, {
  x: number;
  y: number;
  z: number;
  scale: number;
  floatAmplitude: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}> = {
  "top-left": { x: -2.9, y: 1.8, z: -0.1, scale: 1.55, floatAmplitude: 0.06, rotX: -0.35, rotY: -0.19, rotZ: -0.31 },
  "top-right": { x: 2.6, y: 1.8, z: 0.3, scale: 1.3, floatAmplitude: 0.06, rotX: -0.27, rotY: -0.04, rotZ: 0.36 },
  "bottom-left": { x: -2.4, y: -1.6, z: 0.2, scale: 1.45, floatAmplitude: 0.06, rotX: -0.42, rotY: 0.19, rotZ: 0.54 },
  "bottom-right": { x: 2.6, y: -1.2, z: -0.3, scale: 1.35, floatAmplitude: 0.06, rotX: -0.28, rotY: -0.66, rotZ: -0.19 },
};

export const LOGIN_SCENE_DECORATION = {
  count: 7,
  seed: 930,
  minScale: 0.4,
  maxScale: 1.1,
  minRotation: -Math.PI,
  maxRotation: Math.PI,
  rangeX: 23.5,
  rangeY: 7,
  rangeZ: 1,
} as const;
