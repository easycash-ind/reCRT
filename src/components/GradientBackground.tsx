import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ShaderMaterial, Color } from "three";

interface GradientBackgroundProps {
  colorTop: string;
  colorBottom: string;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorTop;
  uniform vec3 uColorBottom;
  varying vec2 vUv;

  void main() {
    vec3 color = mix(uColorBottom, uColorTop, vUv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function GradientBackground({ colorTop, colorBottom }: GradientBackgroundProps) {
  const matRef = useRef<ShaderMaterial>(null);
  const { viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      uColorTop: { value: new Color(colorTop) },
      uColorBottom: { value: new Color(colorBottom) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uColorTop.value.set(colorTop);
    matRef.current.uniforms.uColorBottom.value.set(colorBottom);
  });

  const planeW = (viewport.width + 4) * 1.5;
  const planeH = (viewport.height + 4) * 1.5;

  return (
    <mesh position={[0, 0, -2]} renderOrder={-2}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
