import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Navbar } from "../components/Navbar";
import { DetailSidebar } from "../components/DetailSidebar";
import { Toast } from "../components/Toast";
import { ScenePlayground } from "../playground/ScenePlayground";
import { useConfigPersistence } from "../hooks/useConfigPersistence";
import { HoverModelContext } from "../hooks/useHoverModel";
import { ToastContext, type ToastPayload } from "../hooks/useToast";
import { useAuthStore } from "../stores/useAuthStore";
import "../App.css";

/**
 * 早期设计工作台：顶栏 + 模型悬停详情侧栏 + Leva 场景控制 + 可交互漂浮模型。
 */
export function LoginPlaygroundPage() {
  useConfigPersistence();
  const setPreviewUser = useAuthStore((s) => s.setPreviewUser);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [toast, setToast] = useState<(ToastPayload & { key: number }) | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    setPreviewUser(true);
    return () => setPreviewUser(false);
  }, [setPreviewUser]);

  const showToast = useCallback((payload: ToastPayload) => {
    setToast({ ...payload, key: Date.now() });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <HoverModelContext.Provider value={{ hoveredId, setHoveredId }}>
        <div className="app-container">
          <Leva
            hidden={!showPanel}
            collapsed={false}
            titleBar={{ title: "场景控制面板" }}
            theme={{
              fonts: {
                mono: "Inter, system-ui, -apple-system, sans-serif",
                sans: "Inter, system-ui, -apple-system, sans-serif",
              },
            }}
          />
          <Navbar
            showPanel={showPanel}
            onTogglePanel={() => setShowPanel((v) => !v)}
          />
          <DetailSidebar />
          <Canvas
            camera={{ position: [0, 0, 8], fov: 50 }}
            shadows
            gl={{ antialias: true, alpha: false }}
            className="absolute inset-0 h-full w-full"
            style={{ width: "100%", height: "100%", display: "block" }}
          >
            <ScenePlayground />
          </Canvas>
          {toast && (
            <Toast
              key={toast.key}
              message={toast.message}
              duration={toast.duration ?? 3000}
              onDone={() => setToast(null)}
            />
          )}
        </div>
      </HoverModelContext.Provider>
    </ToastContext.Provider>
  );
}