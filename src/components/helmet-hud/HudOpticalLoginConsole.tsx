import { useRef, useState, type FocusEvent, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  KeyRound,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import logoSvg from "../../assets/logo.svg";

export type HudLoginMethod = "code" | "password";

export interface HudOpticalLoginConsoleProps {
  method: HudLoginMethod;
  onMethodChange: (next: HudLoginMethod) => void;
  email: string;
  onEmailChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  onSendCode: () => void;
  onSubmit: (e: FormEvent) => void;
  onGuestLogin: () => void;
  loading: boolean;
  guestLoading: boolean;
  sendingCode: boolean;
  cooldown: number;
  codeSent: boolean;
  error: string;
  devCode: string | null;
  onInteractiveChange?: (interactive: boolean) => void;
}

export function HudOpticalLoginConsole({
  method,
  onMethodChange,
  email,
  onEmailChange,
  code,
  onCodeChange,
  password,
  onPasswordChange,
  onSendCode,
  onSubmit,
  onGuestLogin,
  loading,
  guestLoading,
  sendingCode,
  cooldown,
  codeSent,
  error,
  devCode,
  onInteractiveChange,
}: HudOpticalLoginConsoleProps) {
  const [showPassword, setShowPassword] = useState(false);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);

  const syncInteractive = (hovered: boolean, focused: boolean) => {
    hoveredRef.current = hovered;
    focusedRef.current = focused;
    onInteractiveChange?.(hovered || focused);
  };

  const handleMouseEnter = () => {
    syncInteractive(true, focusedRef.current);
  };

  const handleMouseLeave = () => {
    syncInteractive(false, focusedRef.current);
  };

  const handleFocusCapture = () => {
    syncInteractive(hoveredRef.current, true);
  };

  const handleBlurCapture = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      syncInteractive(hoveredRef.current, false);
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      className="w-full max-w-[760px] transition-transform duration-150 ease-out select-none"
      style={{
        transform:
          "perspective(1100px) translate3d(calc(var(--hud-console-x, 0) * 12px), calc(var(--hud-console-y, 0) * -8px), 0) rotateY(var(--hud-yaw-deg, 0deg)) rotateX(var(--hud-pitch-deg, 0deg)) rotateZ(var(--hud-roll-deg, 0deg))",
        transformStyle: "preserve-3d",
      }}
    >
      {/* Outer Ambient Grazing Glow on the Top-Left & Top-Right Rim (Simulates light spilling onto the glass edge) */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-1.5 inset-x-4 h-4 rounded-full blur-md opacity-75"
          style={{
            background:
              "linear-gradient(90deg, rgba(255, 255, 255, 0.30) 0%, rgba(255, 255, 255, 0.42) var(--comet-light-x, 15.5%), rgba(var(--comet-prism-rgb, 107, 230, 255), 0.14) 42%, rgba(var(--comet-tail-mid-rgb, 163, 10, 255), 0.08) 68%, rgba(var(--comet-tail-far-rgb, 245, 20, 173), 0.035) 100%)",
          }}
        />

      {/* Translucent Optical HUD Widget Surface — Wide Horizontal Low-Profile Layout */}
      <div
        className="relative overflow-hidden rounded-[22px] px-5 py-4 sm:px-6 sm:py-4.5"
        style={{
          background:
            "linear-gradient(112deg, rgba(255, 255, 255, 0.048) 0%, rgba(255, 255, 255, 0.020) 32%, rgba(16, 16, 20, 0.015) 68%, rgba(8, 8, 12, 0.010) 100%)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          boxShadow:
            "inset 0 -1px 0 rgba(255, 255, 255, 0.03), 0 20px 52px rgba(0, 0, 0, 0.32)",
        }}
      >
        {/* LAYER 1: Diagonal Attenuated Surface Radiosity (Follows the blue reference curve:
            reaches ~55% depth on the left in pure white, tapering sharply upward to only the very top 12% rim on the right with subtle tail color) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background: [
              // 1. Left-side pure white illumination (reaches down toward the left half of Email input)
              "radial-gradient(42% 68% at var(--comet-light-x, 15.5%) 0%, rgba(255, 255, 255, 0.20) 0%, rgba(235, 248, 255, 0.065) 46%, transparent 82%)",
              // 2. Mid-left shallow prism refraction (tapers up to top 28% height)
              "radial-gradient(32% 36% at calc(var(--comet-light-x, 15.5%) + 26%) 0%, rgba(var(--comet-prism-rgb, 107, 230, 255), 0.085) 0%, transparent 72%)",
              // 3. Top-right ultra-shallow & restrained tail color (strictly confined to the top 14%~18% edge above the buttons)
              "radial-gradient(36% 24% at 72% 0%, rgba(var(--comet-tail-mid-rgb, 163, 10, 255), 0.065) 0%, transparent 70%)",
              "radial-gradient(28% 18% at 90% 0%, rgba(var(--comet-tail-far-rgb, 245, 20, 173), 0.042) 0%, transparent 65%)",
            ].join(", "),
            maskImage:
              "linear-gradient(171deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 22%, rgba(0,0,0,0.18) 46%, transparent 64%)",
            WebkitMaskImage:
              "linear-gradient(171deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 22%, rgba(0,0,0,0.18) 46%, transparent 64%)",
          }}
        />

        {/* LAYER 2: Continuous 22px Rounded Top-Grazing Specular Border
            Diagonal falloff mask: left upper corner glows bright white, tapering sharply so the right side only has a faint colored top lip */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            maskImage:
              "linear-gradient(172deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 18%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.03) 75%)",
            WebkitMaskImage:
              "linear-gradient(172deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 18%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.03) 75%)",
          }}
        >
          <div
            className="h-full w-full rounded-[22px] p-[1.2px]"
            style={{
              background:
                "linear-gradient(90deg, rgba(255, 255, 255, 0.90) 0%, rgba(255, 255, 255, 0.98) var(--comet-light-x, 15.5%), rgba(235, 250, 255, 0.62) 28%, rgba(var(--comet-prism-rgb, 107, 230, 255), 0.38) 44%, rgba(var(--comet-tail-mid-rgb, 163, 10, 255), 0.24) 68%, rgba(var(--comet-tail-far-rgb, 245, 20, 173), 0.14) 88%, rgba(var(--comet-tail-far-rgb, 245, 20, 173), 0.06) 100%)",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              WebkitMaskComposite: "xor",
            }}
          />
        </div>
        {/* Subtle base structural rim for the shadowed lower half */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[22px] border border-white/[0.06]"
        />

        {/* Top Row: Brand Identity (Left) + Segmented Mode Pill & Status (Right) */}
        <div
          className="relative flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3.5"
          style={{
            borderBottom: "1px solid transparent",
            borderImage:
              "linear-gradient(90deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.09) 38%, rgba(255,255,255,0.06) 100%) 1",
          }}
        >
          {/* Left: Translucent Rounded Icon Box (Catches bright white star core specular highlight) */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.11] border border-white/[0.24] shadow-[inset_0_1px_0_rgba(255,255,255,0.42),0_0_14px_rgba(255,255,255,0.08)]">
              <img
                src={logoSvg}
                alt="Creative Workshop"
                draggable={false}
                className="h-4 w-4 brightness-0 invert opacity-95"
              />
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.18)]">
                Creative Workshop
              </h1>
              <span className="hidden sm:inline-block text-xs text-white/60">
                企业工作台
              </span>
            </div>
          </div>

          {/* Right: Status Indicator + Translucent Widget Segmented Control (Clean neutral glass, only subtle top rim) */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.035] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.65)]" />
              <span className="text-[11px] font-mono tabular-nums text-white/60">
                HUD Ready
              </span>
            </div>

            {/* Translucent Segmented Mode Switcher */}
            <div
              role="tablist"
              aria-label="登录方式切换"
              className="flex items-center rounded-[11px] bg-white/[0.03] p-0.5 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={method === "code"}
                onClick={() => onMethodChange("code")}
                className={`px-3 py-1 rounded-[9px] text-xs font-medium transition-all cursor-pointer ${
                  method === "code"
                    ? "bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                    : "text-white/50 hover:text-white/85"
                }`}
              >
                验证码登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "password"}
                onClick={() => onMethodChange("password")}
                className={`px-3 py-1 rounded-[9px] text-xs font-medium transition-all cursor-pointer ${
                  method === "password"
                    ? "bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                    : "text-white/50 hover:text-white/85"
                }`}
              >
                密码登录
              </button>
            </div>
          </div>
        </div>

        {/* Optional Compact Diagnostic Pill Row (Error or Dev OTP) */}
        {(error || devCode) && (
          <div className="relative flex flex-wrap items-center gap-2 mb-3">
            {error && (
              <div
                role="alert"
                className="flex items-center gap-1.5 rounded-lg bg-rose-500/[0.14] border border-rose-400/30 px-3 py-1 text-xs text-rose-200 backdrop-blur-md"
              >
                <AlertCircle size={13} className="text-rose-300 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {devCode && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.14] border border-emerald-400/30 px-3 py-1 text-xs text-emerald-100 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/75">开发模式验证码</span>
                <span className="font-mono font-semibold tracking-[0.2em] text-emerald-300 select-all">
                  {devCode}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Row: Horizontal Single-Line Translucent Form Controls */}
        <form
          onSubmit={onSubmit}
          className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          {/* 1. Left Email Input Well (Closest to comet head: brighter pure-white top specular & fill) */}
          <div className="relative flex-1 min-w-0 flex items-center rounded-xl bg-white/[0.048] hover:bg-white/[0.075] focus-within:bg-white/[0.095] border border-white/[0.20] hover:border-white/[0.28] focus-within:border-white/45 transition-all h-10 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]">
            <Mail size={14} className="text-white/70 shrink-0 mr-2.5" />
            <input
              id="hud-login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="企业邮箱"
              className="w-full bg-transparent text-[13px] text-white placeholder:text-white/50 focus:outline-none select-text"
            />
          </div>

          {/* 2. Middle Verification Code Well OR Password Well (Fully aligned styling with Email well) */}
          {method === "code" ? (
            <div className="relative flex-1 min-w-0 flex items-center rounded-xl bg-white/[0.048] hover:bg-white/[0.075] focus-within:bg-white/[0.095] border border-white/[0.20] hover:border-white/[0.28] focus-within:border-white/45 transition-all h-10 pl-3 pr-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]">
              <KeyRound size={14} className="text-white/70 shrink-0 mr-2.5" />
              <input
                id="hud-login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) =>
                  onCodeChange(e.target.value.replace(/\D/g, ""))
                }
                placeholder="6 位验证码"
                className="w-full bg-transparent text-[13px] font-mono tabular-nums tracking-[0.14em] text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-white/50 focus:outline-none select-text"
              />
              <button
                type="button"
                onClick={onSendCode}
                disabled={cooldown > 0 || sendingCode}
                className="shrink-0 h-7 px-2.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.10] disabled:opacity-40 text-[11px] font-medium text-white/85 transition-colors cursor-pointer whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
              >
                {sendingCode
                  ? "发送中..."
                  : cooldown > 0
                    ? `${cooldown}s`
                    : codeSent
                      ? "重新发送"
                      : "获取验证码"}
              </button>
            </div>
          ) : (
            <div className="relative flex-1 min-w-0 flex items-center rounded-xl bg-white/[0.048] hover:bg-white/[0.075] focus-within:bg-white/[0.095] border border-white/[0.20] hover:border-white/[0.28] focus-within:border-white/45 transition-all h-10 pl-3 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]">
              <Lock size={14} className="text-white/70 shrink-0 mr-2.5" />
              <input
                id="hud-login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="输入登录密码"
                className="w-full bg-transparent text-[13px] text-white placeholder:text-white/50 focus:outline-none select-text"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="p-1 text-white/50 hover:text-white/85 transition-colors cursor-pointer shrink-0"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          )}

          {/* 3. Right-Side Action Buttons (Below the attenuation curve: un-tinted neutral translucent glass) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial h-10 px-5 rounded-xl bg-white/[0.13] hover:bg-white/[0.20] border border-white/[0.18] hover:border-white/[0.30] active:scale-[0.99] disabled:opacity-50 text-white text-[13px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_16px_rgba(0,0,0,0.2)]"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-white/80" />
                  <span>登录中</span>
                </>
              ) : (
                <>
                  <span>登录</span>
                  <ArrowRight size={14} className="text-white/85" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onGuestLogin}
              disabled={guestLoading}
              className="h-10 px-3.5 rounded-xl bg-white/[0.045] hover:bg-white/[0.10] border border-white/[0.09] hover:border-white/[0.18] disabled:opacity-50 text-white/70 hover:text-white text-[13px] font-medium transition-all cursor-pointer shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            >
              {guestLoading ? "..." : "游客"}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
