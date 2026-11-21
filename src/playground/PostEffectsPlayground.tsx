import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Vector2, NoToneMapping, type ToneMapping as RendererToneMapping } from "three";
import { useMemo, type ReactElement } from "react";
import { useThree } from "@react-three/fiber";
import { usePostFxControls, useGlobalControls, TONE_MAPPING_OPTIONS } from "../hooks/useSceneControls";

const TONE_MODE_MAP: Record<number, ToneMappingMode> = {
  0: ToneMappingMode.LINEAR,
  1: ToneMappingMode.LINEAR,
  2: ToneMappingMode.REINHARD2,
  3: ToneMappingMode.OPTIMIZED_CINEON,
  4: ToneMappingMode.ACES_FILMIC,
  6: ToneMappingMode.AGX,
  7: ToneMappingMode.NEUTRAL,
};

export function PostEffectsPlayground() {
  const fx = usePostFxControls();
  const global = useGlobalControls();
  const gl = useThree((s) => s.gl);

  const chromaOffset = useMemo(
    () => new Vector2(fx.色差偏移, fx.色差偏移),
    [fx.色差偏移],
  );

  const threeVal = TONE_MAPPING_OPTIONS[global.色调映射] ?? 4;
  const hasEffects = fx.光晕开关 || fx.暗角开关 || fx.色差开关;

  if (!hasEffects) {
    gl.toneMapping = threeVal as RendererToneMapping;
    gl.toneMappingExposure = global.曝光;
    return null;
  }

  gl.toneMapping = NoToneMapping;
  gl.toneMappingExposure = 1;

  const postMode = TONE_MODE_MAP[threeVal] ?? ToneMappingMode.ACES_FILMIC;

  const passes = (
    [
      fx.光晕开关 ? (
        <Bloom
          key="bloom"
          intensity={fx.光晕强度}
          luminanceThreshold={fx.光晕阈值}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      ) : null,
      fx.暗角开关 ? (
        <Vignette key="vignette" offset={fx.暗角偏移} darkness={fx.暗角强度VIG} />
      ) : null,
      fx.色差开关 ? (
        <ChromaticAberration key="chromatic" offset={chromaOffset} />
      ) : null,
      <ToneMapping key="tone" mode={postMode} />,
    ] as (ReactElement | null)[]
  ).filter((el): el is ReactElement => el != null);

  return (
    <EffectComposer multisampling={4}>
      {passes}
    </EffectComposer>
  );
}
