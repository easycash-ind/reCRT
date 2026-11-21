import { useState, useCallback, useEffect, Component, type ReactNode } from "react";
import { Canvas, type RootState } from "@react-three/fiber";
import { Scene } from "./Scene";
import { HoverModelContext } from "../hooks/useHoverModel";

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function StaticFallback({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <div className="absolute inset-0" style={{
      background: "radial-gradient(ellipse at 50% 40%, #1a1a2e 0%, #0f0f1a 100%)",
    }} />
  );
}

export function SceneDecoration({ onReady }: { onReady?: () => void }) {
  const [renderMode, setRenderMode] = useState<"full" | "basic" | "static">("full");

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setRenderMode((mode) => mode === "full" ? "basic" : "static");
    });
  }, []);

  const handleCanvasError = useCallback((error: Error) => {
    console.warn("[login-scene] WebGL scene failed, retrying in basic mode:", error);
    setRenderMode((mode) => mode === "full" ? "basic" : "static");
  }, []);

  if (renderMode === "static") return <StaticFallback onReady={onReady} />;

  return (
    <HoverModelContext.Provider
      value={{
        hoveredId: null,
        setHoveredId: () => {},
      }}
    >
      <CanvasErrorBoundary
        key={renderMode}
        fallback={<StaticFallback onReady={onReady} />}
        onError={handleCanvasError}
      >
        <Canvas
          camera={{ position: [0, 0, 12], fov: 50 }}
          dpr={renderMode === "basic" ? 1 : [1, 1.5]}
          shadows={renderMode === "full"}
          // #root { zoom } 下 getBoundingClientRect 是视觉尺寸，会让 canvas
          // 只铺满约 80% 容器并在右/下留黑边；用 layout offset 对齐容器。
          resize={{ offsetSize: true }}
          gl={{
            antialias: renderMode === "full",
            alpha: false,
            powerPreference: renderMode === "full" ? "high-performance" : "default",
          }}
          className="absolute inset-0 h-full w-full"
          style={{ width: "100%", height: "100%", display: "block" }}
          onCreated={handleCreated}
        >
          <Scene basicMode={renderMode === "basic"} onReady={onReady} />
        </Canvas>
      </CanvasErrorBoundary>
    </HoverModelContext.Provider>
  );
}
