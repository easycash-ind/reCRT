import { CenterElement } from "../components/CenterElement";
import { SafeEnvironment } from "../components/SafeEnvironment";
import { BackgroundGrid } from "../components/BackgroundGrid";
import { GradientBackground } from "../components/GradientBackground";
import { DecorationFieldPlayground } from "./DecorationFieldPlayground";
import { FloatingElementPlayground } from "./FloatingElementPlayground";
import { PostEffectsPlayground } from "./PostEffectsPlayground";
import { FLOATING_ELEMENTS } from "../constants";
import {
  useGlobalControls,
  useHdrControls,
  useGridControls,
} from "../hooks/useSceneControls";

export function ScenePlayground() {
  const global = useGlobalControls();
  const hdr = useHdrControls();
  const grid = useGridControls();

  return (
    <>
      <GradientBackground
        colorTop={global.背景色1}
        colorBottom={global.背景色2}
      />

      <BackgroundGrid
        gridSize={grid.网格尺寸}
        lineWidth={grid.描边粗细}
        lineOpacity={grid.描边不透明度}
        gridColor={grid.网格描边色}
        circleColor={grid.光圈颜色}
        circleOpacity={grid.光圈不透明度}
        circleRadius={grid.光圈大小}
        circleBlur={grid.光圈模糊度}
      />

      {global.灯光 && (
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

      <SafeEnvironment intensity={hdr.亮度} rotation={hdr.旋转} />

      <CenterElement scale={global.Center大小} />

      <DecorationFieldPlayground />

      {FLOATING_ELEMENTS.map((cfg) => (
        <FloatingElementPlayground key={cfg.id} config={cfg} />
      ))}

      <PostEffectsPlayground />
    </>
  );
}