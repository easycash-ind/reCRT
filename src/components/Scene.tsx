import { Component, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils } from "three";
import { CenterElement } from "./CenterElement";
import { FloatingElement } from "./FloatingElement";
import { DecorationField } from "./DecorationField";
import { SafeEnvironment } from "./SafeEnvironment";
import { BackgroundGrid } from "./BackgroundGrid";
import { GradientBackground } from "./GradientBackground";
import { PostEffects } from "./PostEffects";
import {
  FLOATING_ELEMENTS,
  LOGIN_SCENE_GLOBAL,
  LOGIN_SCENE_GRID,
  LOGIN_SCENE_HDR,
} from "../constants";

function CameraController({ distance, offsetX }: { distance: number; offsetX: number }) {
  const initialized = useRef(false);
  useFrame(({ camera }) => {
    if (!initialized.current) {
      camera.position.z = distance;
      camera.position.x = offsetX;
      initialized.current = true;
      return;
    }
    camera.position.z = MathUtils.lerp(camera.position.z, distance, 0.05);
    camera.position.x = MathUtils.lerp(camera.position.x, offsetX, 0.05);
  });
  return null;
}

interface SceneProps {
  basicMode?: boolean;
  onCenterDoubleClick?: () => void;
  onReady?: () => void;
}

class OptionalSceneFeature extends Component<
  { children: ReactNode; name: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[login-scene] ${this.props.name} disabled after render failure:`, error);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function SceneReadySignal({ onReady }: { onReady?: () => void }) {
  const frameCount = useRef(0);
  const reported = useRef(false);
  useFrame(() => {
    if (reported.current || !onReady) return;
    frameCount.current += 1;
    if (frameCount.current < 2) return;
    reported.current = true;
    onReady();
  });
  return null;
}

export function Scene({ basicMode = false, onCenterDoubleClick, onReady }: SceneProps = {}) {
  return (
    <>
      <SceneReadySignal onReady={onReady} />
      <CameraController
        distance={LOGIN_SCENE_GLOBAL.cameraDistance}
        offsetX={LOGIN_SCENE_GLOBAL.cameraOffsetX}
      />

      <GradientBackground
        colorTop={LOGIN_SCENE_GLOBAL.backgroundTop}
        colorBottom={LOGIN_SCENE_GLOBAL.backgroundBottom}
      />

      <OptionalSceneFeature name="background grid">
        <BackgroundGrid
          gridSize={LOGIN_SCENE_GRID.size}
          lineWidth={LOGIN_SCENE_GRID.lineWidth}
          lineOpacity={LOGIN_SCENE_GRID.lineOpacity}
          gridColor={LOGIN_SCENE_GRID.color}
          circleColor={LOGIN_SCENE_GRID.glowColor}
          circleOpacity={LOGIN_SCENE_GRID.glowOpacity}
          circleRadius={LOGIN_SCENE_GRID.glowRadius}
          circleBlur={LOGIN_SCENE_GRID.glowBlur}
        />
      </OptionalSceneFeature>

      {LOGIN_SCENE_GLOBAL.lights && (
        <>
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-4, 3, -3]} intensity={0.4} />
          <directionalLight position={[0, -4, 6]} intensity={0.3} />
        </>
      )}

      {!basicMode && (
        <OptionalSceneFeature name="HDR environment">
          <SafeEnvironment
            intensity={LOGIN_SCENE_HDR.intensity}
            rotation={LOGIN_SCENE_HDR.rotation}
          />
        </OptionalSceneFeature>
      )}

      <CenterElement
        scale={LOGIN_SCENE_GLOBAL.centerScale}
        onDoubleClick={onCenterDoubleClick}
      />

      {!basicMode && (
        <OptionalSceneFeature name="decoration field">
          <DecorationField />
        </OptionalSceneFeature>
      )}

      {FLOATING_ELEMENTS.map((cfg) => (
        <FloatingElement key={cfg.id} config={cfg} />
      ))}

      {!basicMode && (
        <OptionalSceneFeature name="post effects">
          <PostEffects />
        </OptionalSceneFeature>
      )}
    </>
  );
}
