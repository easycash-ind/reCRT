import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShaderMaterial, Color, Vector2 } from "three";
import { useMousePosition } from "../hooks/useMousePosition";

interface BackgroundGridProps {
  gridSize: number;
  lineWidth: number;
  lineOpacity: number;
  gridColor: string;
  circleColor: string;
  circleOpacity: number;
  circleRadius: number;
  circleBlur: number;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uMouse;
  uniform float uGridSize;
  uniform vec3 uGridColor;
  uniform vec3 uCircleColor;
  uniform float uCircleRadius;
  uniform float uCircleBlur;
  uniform float uCircleOpacity;
  uniform float uLineWidth;
  uniform float uLineOpacity;
  uniform vec2 uAspect;

  varying vec2 vUv;

  void main() {
    // Aspect-corrected UV so grid cells are square
    vec2 uvSquare = vUv * uAspect;

    // Grid lines (in aspect-corrected space for square cells)
    vec2 cell = fract(uvSquare * uGridSize);
    float lw = uLineWidth;
    float gridAlpha = 1.0
      - smoothstep(0.0, lw, cell.x)
      * smoothstep(0.0, lw, 1.0 - cell.x)
      * smoothstep(0.0, lw, cell.y)
      * smoothstep(0.0, lw, 1.0 - cell.y);

    // Circle (mouse glow) — also in aspect-corrected space
    vec2 mouseCorrected = uMouse * uAspect;
    float dist = distance(uvSquare, mouseCorrected);
    float circle = 1.0 - smoothstep(uCircleRadius - uCircleBlur, uCircleRadius + uCircleBlur, dist);

    // Grid stroke: apply line opacity independently
    // Circle glow: uses full gridAlpha as mask, unaffected by line opacity
    float strokeAlpha = gridAlpha * uLineOpacity * (1.0 - circle);
    float glowAlpha = gridAlpha * circle * uCircleOpacity;
    vec3 color = uGridColor * strokeAlpha + uCircleColor * glowAlpha;
    float alpha = strokeAlpha + glowAlpha;
    gl_FragColor = vec4(color / max(alpha, 0.001), alpha);
  }
`;

export function BackgroundGrid({
  gridSize,
  lineWidth,
  lineOpacity,
  gridColor,
  circleColor,
  circleOpacity,
  circleRadius,
  circleBlur,
}: BackgroundGridProps) {
  const matRef = useRef<ShaderMaterial>(null);
  const mouse = useMousePosition();
  const { viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      uMouse: { value: new Vector2(0.5, 0.5) },
      uGridSize: { value: gridSize },
      uLineWidth: { value: lineWidth },
      uLineOpacity: { value: lineOpacity },
      uGridColor: { value: new Color(gridColor) },
      uCircleColor: { value: new Color(circleColor) },
      uCircleOpacity: { value: circleOpacity },
      uCircleRadius: { value: circleRadius },
      uCircleBlur: { value: circleBlur },
      uAspect: { value: new Vector2(1, 1) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(() => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;

    u.uMouse.value.set(
      mouse.current.x * 0.5 + 0.5,
      mouse.current.y * 0.5 + 0.5,
    );

    const pw = viewport.width + 2;
    const ph = viewport.height + 2;
    u.uAspect.value.set(pw / ph, 1);

    u.uGridSize.value = gridSize;
    u.uLineWidth.value = lineWidth;
    u.uLineOpacity.value = lineOpacity;
    u.uGridColor.value.set(gridColor);
    u.uCircleColor.value.set(circleColor);
    u.uCircleOpacity.value = circleOpacity;
    u.uCircleRadius.value = circleRadius;
    u.uCircleBlur.value = circleBlur;
  });

  const planeW = viewport.width + 2;
  const planeH = viewport.height + 2;

  return (
    <mesh position={[0, 0, -1]} renderOrder={-1}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
