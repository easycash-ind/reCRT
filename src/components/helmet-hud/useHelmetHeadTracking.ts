import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import {
  DEFAULT_HELMET_HUD_SETTINGS,
  type HelmetHudSettings,
} from "./HelmetHudSettingsPanel";

export interface HelmetHeadPose {
  /** 鼠标/指针归一化目标值 [-1, 1]，向右为 +X，向上为 +Y */
  targetX: number;
  targetY: number;
  /** 快速响应层（眼球/面罩即时响应，Lerp ~0.09） */
  fastX: number;
  fastY: number;
  /** 慢速惯性层（头盔质量惯性/准直虚像层，Lerp ~0.045） */
  slowX: number;
  slowY: number;
  /** 转头瞬时角速度标量 [0, 1]，用于触发准星微缩放与光学响应 */
  velocity: number;
  /** 登录台聚焦/悬停时的稳定阻尼系数：常态为 1.0，聚焦输入时平滑收敛至 0.38 */
  stabilization: number;
}

export interface HelmetTelemetryReadout {
  /** 偏航角，例如 "248.4" (基准 248.0° + slowX * 14.5°) */
  headingDeg: string;
  /** 俯仰角，例如 "+04.2" (基准 +3.5° + slowY * 9.0°) */
  pitchDeg: string;
  /** 滚转角，例如 "-0.8" (-slowX * 2.2°) */
  rollDeg: string;
  /** 流星目标相对视线角误差，例如 "0.042°" */
  targetDeltaDeg: string;
  /** 是否处于稳定光学锁定状态 (velocity < 0.18) */
  trackingLocked: boolean;
  /** 归一化水平与垂直偏移 [-1, 1]，用于刻度尺位移渲染 */
  normYaw: number;
  normPitch: number;
}

export interface UseHelmetHeadTrackingResult {
  containerRef: RefObject<HTMLDivElement | null>;
  headPoseRef: RefObject<HelmetHeadPose>;
  telemetry: HelmetTelemetryReadout;
  setConsoleInteractive: (active: boolean) => void;
}

const INITIAL_TELEMETRY: HelmetTelemetryReadout = {
  headingDeg: "248.0",
  pitchDeg: "+3.5",
  rollDeg: "+0.0",
  targetDeltaDeg: "0.018°",
  trackingLocked: true,
  normYaw: 0,
  normPitch: 0,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function useHelmetHeadTracking(
  hudSettings?: HelmetHudSettings
): UseHelmetHeadTrackingResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const consoleInteractiveRef = useRef<boolean>(false);
  const hudSettingsRef = useRef<HelmetHudSettings>(
    hudSettings ?? DEFAULT_HELMET_HUD_SETTINGS
  );
  hudSettingsRef.current = hudSettings ?? DEFAULT_HELMET_HUD_SETTINGS;

  const headPoseRef = useRef<HelmetHeadPose>({
    targetX: 0,
    targetY: 0,
    fastX: 0,
    fastY: 0,
    slowX: 0,
    slowY: 0,
    velocity: 0,
    stabilization: 1.0,
  });

  const [telemetry, setTelemetry] = useState<HelmetTelemetryReadout>(INITIAL_TELEMETRY);

  const setConsoleInteractive = useCallback((active: boolean) => {
    consoleInteractiveRef.current = active;
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const nx = Math.max(-1, Math.min(1, (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1)));
      headPoseRef.current.targetX = nx;
      headPoseRef.current.targetY = ny;
    };

    const onPointerLeave = () => {
      headPoseRef.current.targetX = 0;
      headPoseRef.current.targetY = 0;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("mouseleave", onPointerLeave);

    let rafId = 0;
    let lastTelemetryTime = 0;
    const startTime = performance.now();

    // 宇航员零重力头盔偶发微晃动状态（模拟失重悬浮下偶尔的轻微姿态微调与呼吸起伏）
    let swayTargetX = 0;
    let swayTargetY = 0;
    let swayTargetRoll = 0;
    let swayCurrX = 0;
    let swayCurrY = 0;
    let swayCurrRoll = 0;
    let nextImpulseTime = 1.8 + Math.random() * 2.4;
    let impulseHoldUntil = 0;

    // Palette constants matching MeteorHeroCanvas fragmentShader iridescentColorBlocks
    const cIceCyan: [number, number, number] = [107, 230, 255];
    const cEmeraldMint: [number, number, number] = [56, 250, 148];
    const cChampagneGold: [number, number, number] = [255, 220, 87];
    const cVividPurple: [number, number, number] = [163, 10, 255];
    const cVividMagenta: [number, number, number] = [245, 20, 173];
    const cElectricBlue: [number, number, number] = [56, 138, 255];

    const tick = (now: number) => {
      const pose = headPoseRef.current;
      const t = (now - startTime) * 0.001;

      const targetStabilization = consoleInteractiveRef.current ? 0.38 : 1.0;
      pose.stabilization += (targetStabilization - pose.stabilization) * 0.08;

      const swayAmp = Math.max(0, hudSettingsRef.current.swayAmplitude ?? 1.0);
      const swayFreq = Math.max(0.15, hudSettingsRef.current.swayFrequency ?? 1.0);

      // 偶发随机头盔微晃动触发器（触发间隔与过渡速度受 swayFrequency 控制，偏移量受 swayAmplitude 控制）
      if (t >= nextImpulseTime) {
        const angle = Math.random() * Math.PI * 2;
        const ampX = 0.065 + Math.random() * 0.085;
        const ampY = 0.055 + Math.random() * 0.075;
        swayTargetX = Math.cos(angle) * ampX;
        swayTargetY = Math.sin(angle) * ampY;
        swayTargetRoll = (Math.random() - 0.5) * 0.65;
        const holdDuration = (0.75 + Math.random() * 1.15) / swayFreq;
        impulseHoldUntil = t + holdDuration;
        nextImpulseTime = t + holdDuration + (2.6 + Math.random() * 3.8) / swayFreq;
      } else if (t >= impulseHoldUntil) {
        // 晃动脉冲结束后柔和回正至平衡态
        const decay = Math.pow(0.94, swayFreq);
        swayTargetX *= decay;
        swayTargetY *= decay;
        swayTargetRoll *= decay;
      }

      // 叠加极轻微的宇航员呼吸悬浮基底波 + 偶发随机姿态微晃动
      const tf = t * swayFreq;
      const breathX = Math.sin(tf * 0.68) * 0.014 + Math.cos(tf * 1.13) * 0.008;
      const breathY = Math.sin(tf * 0.92 + 0.8) * 0.018 + Math.sin(tf * 1.57) * 0.007;

      const followRate = Math.min(0.14, 0.032 * (0.65 + 0.35 * swayFreq));
      swayCurrX += (swayTargetX - swayCurrX) * followRate;
      swayCurrY += (swayTargetY - swayCurrY) * followRate;
      swayCurrRoll += (swayTargetRoll - swayCurrRoll) * followRate;

      // 在输入聚焦时自动减弱晃动幅度，避免干扰用户点击输入
      const swayScale = (0.45 + 0.55 * pose.stabilization) * swayAmp;
      const effectiveTargetX = Math.max(
        -1,
        Math.min(1, pose.targetX + (swayCurrX + breathX) * swayScale)
      );
      const effectiveTargetY = Math.max(
        -1,
        Math.min(1, pose.targetY + (swayCurrY + breathY) * swayScale)
      );

      pose.fastX += (effectiveTargetX - pose.fastX) * 0.09;
      pose.fastY += (effectiveTargetY - pose.fastY) * 0.09;

      pose.slowX += (effectiveTargetX - pose.slowX) * 0.045;
      pose.slowY += (effectiveTargetY - pose.slowY) * 0.045;

      pose.velocity = Math.min(
        1,
        Math.hypot(effectiveTargetX - pose.fastX, effectiveTargetY - pose.fastY) * 1.6
      );

      const el = containerRef.current;
      if (el) {
        const s = el.style;
        s.setProperty("--hud-fast-x", pose.fastX.toFixed(4));
        s.setProperty("--hud-fast-y", pose.fastY.toFixed(4));
        s.setProperty("--hud-slow-x", pose.slowX.toFixed(4));
        s.setProperty("--hud-slow-y", pose.slowY.toFixed(4));
        s.setProperty("--hud-console-x", (pose.slowX * pose.stabilization).toFixed(4));
        s.setProperty("--hud-console-y", (pose.slowY * pose.stabilization).toFixed(4));
        s.setProperty("--hud-yaw-deg", `${(-pose.slowX * 2.4 * pose.stabilization).toFixed(3)}deg`);
        s.setProperty("--hud-pitch-deg", `${(pose.slowY * 1.8 * pose.stabilization).toFixed(3)}deg`);
        s.setProperty(
          "--hud-roll-deg",
          `${((-pose.slowX * 0.38 + swayCurrRoll * swayAmp) * pose.stabilization).toFixed(3)}deg`
        );

        // =====================================================================
        // Real-time Comet-to-HUD Radiosity & Spectral Color Synchronization
        // =====================================================================
        // 1. Star core projection hotspot X on the login bar top edge (base ~15%, shifts with head turn)
        const lightHotspotX = 15.5 - pose.fastX * 8.5;
        s.setProperty("--comet-light-x", `${lightHotspotX.toFixed(1)}%`);

        // 2. Core white intensity modulation (tracks star core breathing sin(t * 7.5) & vertical proximity)
        const corePulse = 1.0 + Math.sin(t * 7.5) * 0.06 + pose.fastY * 0.08;
        s.setProperty("--comet-core-pulse", corePulse.toFixed(3));

        // 3. Mid-left prism wing color (32% ~ 58% of login top bar):
        // Reflects the cyan/mint/gold lower shockwave wing right behind the star core
        const wingWave = Math.sin(t * 1.45) * 0.5 + 0.5;
        const goldWave = Math.sin(t * 1.9 - 0.8) * 0.5 + 0.5;
        const prismCol = mix3(
          mix3(cIceCyan, cEmeraldMint, wingWave * 0.78),
          cChampagneGold,
          goldWave * 0.65
        );
        s.setProperty("--comet-prism-rgb", `${prismCol[0]}, ${prismCol[1]}, ${prismCol[2]}`);

        // 4. Right-side tail plume colors (55% ~ 100% of login top bar):
        // Synchronized with GLSL iridescentColorBlocks cycle (t * 0.38 + traveling wave along tail)
        const cycleMid = t * 0.85 + Math.sin(t * 1.6) * 0.45;
        const pSapphireMid = smoothstep(-0.3, 0.75, Math.sin(cycleMid));
        const pCrimsonMid = smoothstep(-0.25, 0.75, Math.sin(cycleMid * 0.77 + 1.65));
        const tailMidCol = mix3(
          mix3(cVividPurple, cVividMagenta, pCrimsonMid * 0.85),
          cElectricBlue,
          pSapphireMid * 0.52
        );
        s.setProperty("--comet-tail-mid-rgb", `${tailMidCol[0]}, ${tailMidCol[1]}, ${tailMidCol[2]}`);

        // Far-right tail color with traveling phase lag (simulates plasma flowing from left to right)
        const cycleFar = (t - 0.95) * 0.85 + Math.cos(t * 1.35) * 0.45;
        const pSapphireFar = smoothstep(-0.3, 0.75, Math.sin(cycleFar));
        const pCrimsonFar = smoothstep(-0.25, 0.75, Math.sin(cycleFar * 0.77 + 1.65));
        const tailFarCol = mix3(
          mix3(cVividMagenta, cVividPurple, pCrimsonFar * 0.82),
          mix3(cElectricBlue, cEmeraldMint, 0.35),
          pSapphireFar * 0.58
        );
        s.setProperty("--comet-tail-far-rgb", `${tailFarCol[0]}, ${tailFarCol[1]}, ${tailFarCol[2]}`);
      }

      if (now - lastTelemetryTime >= 80) {
        lastTelemetryTime = now;
        const headingDeg = (248.0 + pose.slowX * 14.5).toFixed(1);
        const pitchVal = 3.5 + pose.slowY * 9.0;
        const pitchDeg = `${pitchVal >= 0 ? "+" : ""}${pitchVal.toFixed(1)}`;
        const rollVal = -pose.slowX * 2.2 + swayCurrRoll * swayAmp * 0.85;
        const rollDeg = `${rollVal >= 0 ? "+" : ""}${rollVal.toFixed(1)}`;
        const deltaVal = 0.018 + Math.hypot(pose.fastX - pose.slowX, pose.fastY - pose.slowY) * 0.45;
        const targetDeltaDeg = `${deltaVal.toFixed(3)}°`;
        const trackingLocked = pose.velocity < 0.22;
        const normYaw = Number(pose.slowX.toFixed(3));
        const normPitch = Number(pose.slowY.toFixed(3));

        setTelemetry((prev) => {
          if (
            prev.headingDeg === headingDeg &&
            prev.pitchDeg === pitchDeg &&
            prev.rollDeg === rollDeg &&
            prev.targetDeltaDeg === targetDeltaDeg &&
            prev.trackingLocked === trackingLocked &&
            prev.normYaw === normYaw &&
            prev.normPitch === normPitch
          ) {
            return prev;
          }
          return {
            headingDeg,
            pitchDeg,
            rollDeg,
            targetDeltaDeg,
            trackingLocked,
            normYaw,
            normPitch,
          };
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("mouseleave", onPointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return {
    containerRef,
    headPoseRef,
    telemetry,
    setConsoleInteractive,
  };
}
