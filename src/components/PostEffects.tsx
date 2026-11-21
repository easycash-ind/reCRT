import {
  EffectComposer,
  Bloom,
  Vignette,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { NoToneMapping, type WebGLRenderer } from "three";
import { useEffect, type ReactElement } from "react";
import { useThree } from "@react-three/fiber";
import { LOGIN_SCENE_GLOBAL } from "../constants";

const TONE_MODE_MAP: Record<number, ToneMappingMode> = {
  0: ToneMappingMode.LINEAR,
  1: ToneMappingMode.LINEAR,
  2: ToneMappingMode.REINHARD2,
  3: ToneMappingMode.OPTIMIZED_CINEON,
  4: ToneMappingMode.ACES_FILMIC,
  6: ToneMappingMode.AGX,
  7: ToneMappingMode.NEUTRAL,
};

function configurePostProcessingRenderer(renderer: WebGLRenderer) {
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
}

export function PostEffects() {
  const gl = useThree((s) => s.gl);

  const threeVal = LOGIN_SCENE_GLOBAL.toneMapping === "ACES" ? 4 : 0;

  useEffect(() => {
    configurePostProcessingRenderer(gl);
  }, [gl]);

  const postMode = TONE_MODE_MAP[threeVal] ?? ToneMappingMode.ACES_FILMIC;

  const passes = (
    [
      (
        <Bloom
          key="bloom"
          intensity={1.55}
          luminanceThreshold={0.95}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      ),
      <Vignette key="vignette" offset={0.25} darkness={0.8} />,
      <ToneMapping key="tone" mode={postMode} />,
    ] as (ReactElement | null)[]
  ).filter((el): el is ReactElement => el != null);

  return (
    <EffectComposer multisampling={4}>
      {passes}
    </EffectComposer>
  );
}
