type Vec3 = [number, number, number]

export interface FloatingElementConfig {
  id: string;
  /** GLB file path under /public, e.g. "/video.glb" */
  glbUrl: string;
  position: Vec3;
  scale: number;
  color: string;
  /** Unique phase offset so each element floats differently */
  phaseOffset: number;
  /** Rotation speed multiplier per axis [rx, ry, rz] */
  rotationSpeed: Vec3;
}
