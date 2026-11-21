import { useEffect, useState, Component, type ReactNode } from "react";
import { Environment } from "@react-three/drei";
import { BackSide } from "three";

interface SafeEnvironmentProps {
  intensity: number;
  rotation: number;
}

/**
 * Supported HDR/image file names probed in order under /public.
 * Drop a file named HDR.hdr (or .exr/.jpg/.png) into frontend/public/
 * and it will be used automatically.
 */
const HDR_CANDIDATES = ["/HDR.hdr", "/HDR.exr", "/HDR.jpg", "/HDR.png"];

type EnvMode = "file" | "color";

/**
 * 1) Probes public/ for a local HDR/image file (HDR.hdr, HDR.exr, etc.)
 * 2) If none found → renders a solid white sphere as environment
 *
 * Both paths keep leva "亮度" and "旋转" controls functional.
 * A class-based error boundary prevents Canvas crashes if the file
 * is detected but fails to parse at runtime.
 */
export function SafeEnvironment({ intensity, rotation }: SafeEnvironmentProps) {
  const [mode, setMode] = useState<EnvMode | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      for (const url of HDR_CANDIDATES) {
        try {
          const res = await fetch(url, { method: "GET", cache: "no-cache" });
          const ct = res.headers.get("content-type") ?? "";
          if (res.ok && !ct.includes("text/html")) {
            if (!cancelled) {
              setFileUrl(url);
              setMode("file");
            }
            return;
          }
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setMode("color");
    }

    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === null) return null;

  if (mode === "file" && fileUrl) {
    return (
      <EnvErrorBoundary fallbackIntensity={intensity} fallbackRotation={rotation}>
        <Environment
          files={fileUrl}
          environmentIntensity={intensity}
          environmentRotation={[0, rotation, 0]}
        />
      </EnvErrorBoundary>
    );
  }

  return <ColorEnvironment intensity={intensity} rotation={rotation} />;
}

function ColorEnvironment({
  intensity,
  rotation,
}: {
  intensity: number;
  rotation: number;
}) {
  return (
    <Environment
      environmentIntensity={intensity}
      environmentRotation={[0, rotation, 0]}
    >
      <mesh scale={50}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#FFFFFF" side={BackSide} />
      </mesh>
    </Environment>
  );
}

/* ---- Error boundary: falls back to ColorEnvironment on load failure ---- */

interface BoundaryProps {
  children: ReactNode;
  fallbackIntensity: number;
  fallbackRotation: number;
}
interface BoundaryState {
  hasError: boolean;
}

class EnvErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("HDR file failed to load, using color fallback:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ColorEnvironment
          intensity={this.props.fallbackIntensity}
          rotation={this.props.fallbackRotation}
        />
      );
    }
    return this.props.children;
  }
}
