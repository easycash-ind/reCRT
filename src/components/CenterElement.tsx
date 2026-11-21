import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, Group } from "three";
import { useMousePosition } from "../hooks/useMousePosition";
import { MOUSE_FOLLOW_LERP_FACTOR, MAX_ROTATION_ANGLE } from "../constants";
import { GlbModel } from "./GlbModel";

interface CenterElementProps {
  scale: number;
  onDoubleClick?: () => void;
}

/**
 * Central 3D element group that smoothly rotates to follow the mouse cursor.
 * Mouse left → model faces left, mouse up → model faces up.
 */
export function CenterElement({ scale, onDoubleClick }: CenterElementProps) {
  const groupRef = useRef<Group>(null);
  const mouse = useMousePosition();

  useFrame(() => {
    if (!groupRef.current) return;

    const targetRotX = -mouse.current.y * MAX_ROTATION_ANGLE;
    const targetRotY = mouse.current.x * MAX_ROTATION_ANGLE;

    groupRef.current.rotation.x = MathUtils.lerp(
      groupRef.current.rotation.x,
      targetRotX,
      MOUSE_FOLLOW_LERP_FACTOR
    );
    groupRef.current.rotation.y = MathUtils.lerp(
      groupRef.current.rotation.y,
      targetRotY,
      MOUSE_FOLLOW_LERP_FACTOR
    );
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]} onDoubleClick={onDoubleClick}>
      <GlbModel
        url="/center.glb"
        fallbackColor="#3d5afe"
        fallbackSize={[1.6, 1.6, 1.6]}
        scale={scale}
      />
    </group>
  );
}
