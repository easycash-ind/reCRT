import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { SceneDecoration } from "../components/SceneDecoration";

/** 纯 3D 启动场景（无登录表单），用于场景与模型迭代 */
export function LoginSceneOnlyPage() {
  const [sceneReady, setSceneReady] = useState(false);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0f0f1a]">
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <SceneDecoration onReady={handleSceneReady} />
      </div>
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-[#0f0f1a] transition-opacity duration-500 ease-out ${
          sceneReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden={sceneReady}
      >
        <Loader2 size={30} className="animate-spin text-white/80" />
      </div>
    </div>
  );
}