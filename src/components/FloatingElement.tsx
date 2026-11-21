import { useRef, useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3, MathUtils, Euler, Quaternion } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { FloatingElementConfig } from "../types";
import {
  FLOAT_SPEED,
  LOGIN_SCENE_ELEMENTS,
  LOGIN_SCENE_GLOW,
  LOGIN_SCENE_ROTATION,
} from "../constants";
import { GlbModel } from "./GlbModel";
import { useHoverModel } from "../hooks/useHoverModel";

const DEG2RAD = Math.PI / 180;
const MAX_DRAG_PX = 100;

const _forward = new Vector3(0, 0, 1);
const _lookTarget = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const SPRING_LERP = 0.08;
const PRESS_SCALE = 0.95;
const HOVER_SCALE = 1.08;
const SCALE_LERP = 0.12;
const ROT_LERP = 0.1;

interface FloatingElementProps {
  config: FloatingElementConfig;
}

function useDrag() {
  const dragging = useRef(false);
  const startPointer = useRef({ x: 0, y: 0 });
  const dragOffset = useRef(new Vector3(0, 0, 0));
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const calcOffset = useCallback((clientX: number, clientY: number) => {
    const dxPx = clientX - startPointer.current.x;
    const dyPx = clientY - startPointer.current.y;

    const attenuate = (px: number) => {
      const sign = Math.sign(px);
      const abs = Math.min(Math.abs(px), MAX_DRAG_PX * 4);
      return sign * MAX_DRAG_PX * Math.tanh(abs / MAX_DRAG_PX);
    };

    const fov = 'fov' in camera ? (camera as { fov: number }).fov : 50;
    const worldPerPx = 2 * camera.position.z * Math.tan((fov * DEG2RAD) / 2) / size.height;

    dragOffset.current.set(
      attenuate(dxPx) * worldPerPx,
      -attenuate(dyPx) * worldPerPx,
      0,
    );
  }, [camera, size]);

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragging.current = true;
    startPointer.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    dragOffset.current.set(0, 0, 0);
  }, []);

  useEffect(() => {
    const onWindowMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      calcOffset(e.clientX, e.clientY);
    };
    const onWindowUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
    };
  }, [calcOffset]);

  return { dragging, dragOffset, onPointerDown };
}

export function FloatingElement({ config }: FloatingElementProps) {
  const groupRef = useRef<Group>(null);
  const appliedOffset = useRef(new Vector3(0, 0, 0));
  const currentScale = useRef(1);
  const currentRot = useRef({ x: 0, y: 0, z: 0 });
  const hovered = useRef(false);
  const { color, glbUrl, phaseOffset, rotationSpeed } = config;
  const ctrl = LOGIN_SCENE_ELEMENTS[config.id] ?? {
    x: config.position[0],
    y: config.position[1],
    z: config.position[2],
    scale: config.scale,
    floatAmplitude: 0.06,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
  };

  const { dragging, dragOffset, onPointerDown } = useDrag();
  const { setHoveredId } = useHoverModel();

  const onPointerOver = useCallback(() => {
    hovered.current = true;
    setHoveredId(config.id);
  }, [config.id, setHoveredId]);
  const onPointerOut = useCallback(() => {
    hovered.current = false;
    setHoveredId(null);
  }, [setHoveredId]);

  useFrame(({ clock, camera }) => {
    if (!groupRef.current) return;

    const baseScale = ctrl.scale;
    let targetScale = baseScale;
    if (dragging.current) {
      targetScale = baseScale * PRESS_SCALE;
    } else if (hovered.current) {
      targetScale = baseScale * HOVER_SCALE;
    }
    currentScale.current = MathUtils.lerp(currentScale.current, targetScale, SCALE_LERP);
    groupRef.current.scale.setScalar(currentScale.current);

    if (dragging.current) {
      appliedOffset.current.copy(dragOffset.current);
    } else {
      appliedOffset.current.x = MathUtils.lerp(appliedOffset.current.x, 0, SPRING_LERP);
      appliedOffset.current.y = MathUtils.lerp(appliedOffset.current.y, 0, SPRING_LERP);
    }

    const t = clock.getElapsedTime() * FLOAT_SPEED;
    const p = phaseOffset;
    const amp = ctrl.floatAmplitude;

    groupRef.current.position.x = ctrl.x + Math.sin(t + p) * amp + appliedOffset.current.x;
    groupRef.current.position.y =
      ctrl.y + Math.sin(t * 1.3 + p + 1.0) * amp + appliedOffset.current.y;
    groupRef.current.position.z =
      ctrl.z + Math.sin(t * 0.7 + p + 2.0) * amp * 0.5;

    const speed = LOGIN_SCENE_ROTATION.speed;
    const maxAngle = LOGIN_SCENE_ROTATION.maxAngleDegrees * DEG2RAD;

    const floatRotX = ctrl.rotX + Math.sin(t * rotationSpeed[0] * speed + p) * maxAngle;
    const floatRotY = ctrl.rotY + Math.sin(t * rotationSpeed[1] * speed + p + 1.0) * maxAngle;
    const floatRotZ = ctrl.rotZ + Math.sin(t * rotationSpeed[2] * speed + p + 2.0) * maxAngle;

    let targetRotX = floatRotX;
    let targetRotY = floatRotY;
    let targetRotZ = floatRotZ;

    if (hovered.current) {
      const pos = groupRef.current.position;
      const camPos = camera.position;
      const lookEuler = _euler;
      _lookTarget.copy(camPos).sub(pos).normalize();
      _quat.setFromUnitVectors(_forward, _lookTarget);
      lookEuler.setFromQuaternion(_quat);
      targetRotX = lookEuler.x;
      targetRotY = lookEuler.y;
      targetRotZ = lookEuler.z;
    }

    currentRot.current.x = MathUtils.lerp(currentRot.current.x, targetRotX, ROT_LERP);
    currentRot.current.y = MathUtils.lerp(currentRot.current.y, targetRotY, ROT_LERP);
    currentRot.current.z = MathUtils.lerp(currentRot.current.z, targetRotZ, ROT_LERP);

    groupRef.current.rotation.x = currentRot.current.x;
    groupRef.current.rotation.y = currentRot.current.y;
    groupRef.current.rotation.z = currentRot.current.z;
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <GlbModel
        url={glbUrl}
        fallbackColor={color}
        scale={1}
        disableInteraction
        hoveredRef={hovered}
        glowControls={LOGIN_SCENE_GLOW}
      />
    </group>
  );
}
