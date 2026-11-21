import type { HelmetTelemetryReadout } from "./useHelmetHeadTracking";

export interface HelmetVisorOverlayProps {
  telemetry: HelmetTelemetryReadout;
}

const HEADING_TICKS = [220, 230, 240, 250, 260, 270, 280] as const;
const PITCH_RUNGS = [20, 15, 10, 5, 0, -5, -10, -15, -20] as const;

export function HelmetVisorOverlay({ telemetry }: HelmetVisorOverlayProps) {
  return (
    <div
      className="pointer-events-none select-none fixed inset-0 z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* ====================================================================
          LAYER L3 — Physical Helmet Visor Curvature & Pure White Edge Optics
          ==================================================================== */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform:
            "translate3d(calc(var(--hud-fast-x, 0) * -6px), calc(var(--hud-fast-y, 0) * 5px), 0)",
        }}
      >
        {/* Subtle Visor Vignette & Pure Neutral White Rim Glow */}
        <div
          className="absolute inset-0"
          style={{
            background: [
              "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 64%, rgba(255, 255, 255, 0.018) 84%, rgba(0, 0, 0, 0.72) 100%)",
              "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.035) 0%, transparent 40%)",
            ].join(", "),
          }}
        />

        {/* Top Curved Visor Inner Reflection Arc (Pure White Alpha Gradient) */}
        <svg
          className="absolute top-1 left-0 h-16 w-full"
          viewBox="0 0 1000 64"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <linearGradient id="visor-top-rim-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="20%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="38%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="44%" stopColor="rgba(255,255,255,0)" />
              <stop offset="56%" stopColor="rgba(255,255,255,0)" />
              <stop offset="62%" stopColor="rgba(255,255,255,0.14)" />
              <stop offset="80%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <path
            d="M 36,42 Q 500,2 964,42"
            stroke="url(#visor-top-rim-grad)"
            strokeWidth="1"
          />
        </svg>

        {/* Bottom Curved Visor Inner Reflection Arc */}
        <svg
          className="absolute bottom-1 left-0 h-14 w-full"
          viewBox="0 0 1000 56"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <linearGradient id="visor-bottom-rim-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="28%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="72%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <path
            d="M 56,8 Q 500,46 944,8"
            stroke="url(#visor-bottom-rim-grad)"
            strokeWidth="1"
          />
        </svg>

        {/* 4 Subtle Corner Viewfinder Marks (Pure White) */}
        <div className="absolute top-6 left-6 sm:top-8 sm:left-8 h-3.5 w-3.5 border-t border-l border-white/[0.16] rounded-tl-[2px]" />
        <div className="absolute top-6 right-6 sm:top-8 sm:right-8 h-3.5 w-3.5 border-t border-r border-white/[0.16] rounded-tr-[2px]" />
        <div className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 h-3.5 w-3.5 border-b border-l border-white/[0.16] rounded-bl-[2px]" />
        <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 h-3.5 w-3.5 border-b border-r border-white/[0.16] rounded-br-[2px]" />
      </div>

      {/* ====================================================================
          LAYER L1 — Celestial Target Lock Reticle (Pure White Minimalist Tracker)
          ==================================================================== */}
      <div
        className="absolute left-[31.5%] top-[40.5%] sm:left-[33%] sm:top-[40%] will-change-transform"
        style={{
          transform:
            "translate3d(calc(var(--hud-slow-x, 0) * -42px), calc(var(--hud-slow-y, 0) * 30px), 0)",
        }}
      >
        <div className="relative flex items-center">
          {/* Clean White Widget-Style Telemetry Pill (Positioned in clear deep space to the left of the meteor head) */}
          <div className="-mt-6 pr-1.5 flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  telemetry.trackingLocked
                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                    : "bg-white/60"
                }`}
              />
              <span className="text-[10.5px] font-medium tracking-[0.08em] text-white/85 whitespace-nowrap">
                C-2026 Meteoroid
              </span>
            </div>
            <div className="text-[9.5px] font-mono tabular-nums tracking-[0.06em] text-white/45 whitespace-nowrap">
              72.4 km/s · Δθ {telemetry.targetDeltaDeg}
            </div>
          </div>

          {/* 45° White Hairline Leader SVG (Pointing down-right toward the meteor star core) */}
          <svg
            className="-mr-0.5 -mt-4 h-5 w-10 shrink-0 overflow-visible"
            viewBox="0 0 40 20"
            fill="none"
          >
            <polyline
              points="0,5 27,5 39,17"
              stroke="rgba(255, 255, 255, 0.36)"
              strokeWidth="1"
            />
            <circle cx="27" cy="5" r="1.2" fill="rgba(255, 255, 255, 0.8)" />
          </svg>

          {/* Clean Optical Circle / Corner Reticle */}
          <div className="relative flex h-6 w-6 items-center justify-center">
            <div className="absolute inset-0.5 rounded-full border border-white/30" />
            <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-white/60" />
            <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-white/60" />
            <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-white/60" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-white/60" />
            <span className="h-1 w-1 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
          </div>
        </div>
      </div>

      {/* ====================================================================
          LAYER L2 — Collimated White HUD Telemetry (Spherical Projection)
          ==================================================================== */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform:
            "perspective(1100px) translate3d(calc(var(--hud-slow-x, 0) * 12px), calc(var(--hud-slow-y, 0) * -9px), 0) rotateY(var(--hud-yaw-deg, 0deg)) rotateX(var(--hud-pitch-deg, 0deg)) rotateZ(var(--hud-roll-deg, 0deg))",
        }}
      >
        {/* Top Center Spherical Heading Tape */}
        <div className="absolute top-6 sm:top-7 left-1/2 -translate-x-1/2 flex flex-col items-center w-[300px]">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08]">
            <span className="text-[9px] font-medium tracking-[0.12em] text-white/45">
              HDG
            </span>
            <span className="font-mono tabular-nums text-[10px] font-medium tracking-[0.08em] text-white/85">
              {telemetry.headingDeg}°
            </span>
          </div>

          <span className="text-[7px] leading-none text-white/60 my-0.5">▾</span>

          {/* Masked Horizontal Tick Strip */}
          <div
            className="relative overflow-hidden w-56 h-4 flex items-start justify-center"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)",
            }}
          >
            <div
              className="flex items-start gap-5 transition-transform duration-75 ease-out"
              style={{
                transform: `translateX(${-telemetry.normYaw * 36}px)`,
              }}
            >
              {HEADING_TICKS.map((deg) => (
                <div key={deg} className="flex flex-col items-center">
                  <div className="flex items-start gap-2.5">
                    <span className="h-1 w-px bg-white/18" />
                    <span className="h-1.5 w-px bg-white/45" />
                    <span className="h-1 w-px bg-white/18" />
                  </div>
                  <span className="mt-0.5 font-mono tabular-nums text-[7.5px] tracking-[0.12em] text-white/32">
                    {deg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Left Peripheral Suit & Visor Readout (Pure White Hierarchy) */}
        <div className="hidden md:flex fixed left-7 lg:left-9 top-1/2 -translate-y-1/2 flex-col gap-3">
          <div className="border-l border-white/20 pl-3 flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium tracking-[0.06em] text-white/70">
                O₂ 98.4% · 4.3 psi
              </span>
              <span className="text-[9px] tracking-[0.04em] text-white/35">
                EVA Suit Nominal
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="font-mono tabular-nums text-[10px] tracking-[0.06em] text-white/65">
                Roll {telemetry.rollDeg}°
              </span>
              <span className="text-[9px] tracking-[0.04em] text-white/35">
                Visor Stabilized
              </span>
            </div>

            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[9px] font-medium tracking-[0.06em] text-white/50">
                Orbital Link Active
              </span>
            </div>
          </div>
        </div>

        {/* Right Peripheral Pitch Scale (Pure White Hierarchy) */}
        <div className="hidden md:flex fixed right-7 lg:right-9 top-1/2 -translate-y-1/2 items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="font-mono tabular-nums text-[10px] font-medium tracking-[0.08em] text-white/70">
              {telemetry.pitchDeg}°
            </span>
            <span className="text-[8.5px] tracking-[0.08em] text-white/32">
              Pitch
            </span>
          </div>

          <span className="text-[8px] leading-none text-white/65">◂</span>

          <div
            className="h-32 w-5 overflow-hidden relative flex items-center justify-end pr-1 border-r border-white/15"
            style={{
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
            }}
          >
            <div
              className="flex flex-col items-end gap-3.5 transition-transform duration-75 ease-out"
              style={{
                transform: `translateY(${telemetry.normPitch * 24}px)`,
              }}
            >
              {PITCH_RUNGS.map((rung) => {
                const isZero = rung === 0;
                const isMajor = rung % 10 === 0;
                return (
                  <div key={rung} className="flex items-center gap-1">
                    {isMajor && (
                      <span className="font-mono tabular-nums text-[7px] text-white/30">
                        {rung > 0 ? `+${rung}` : rung}
                      </span>
                    )}
                    <span
                      className={`h-px ${
                        isZero
                          ? "w-3.5 bg-white/80"
                          : isMajor
                            ? "w-2.5 bg-white/45"
                            : "w-1.5 bg-white/22"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
