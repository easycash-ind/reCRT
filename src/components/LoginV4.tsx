import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  applyHubDisplayModeToDom,
  useHubThemeStore,
} from "../stores/useHubThemeStore";
import { MeteorHeroCanvas } from "./MeteorHeroCanvas";
import { HelmetVisorOverlay } from "./helmet-hud/HelmetVisorOverlay";
import {
  HudOpticalLoginConsole,
  type HudLoginMethod,
} from "./helmet-hud/HudOpticalLoginConsole";
import {
  HelmetHudSettingsPanel,
  DEFAULT_HELMET_HUD_SETTINGS,
  loadHelmetHudSettings,
  saveHelmetHudSettings,
  clearHelmetHudSettings,
  type HelmetHudSettings,
} from "./helmet-hud/HelmetHudSettingsPanel";
import { useHelmetHeadTracking } from "./helmet-hud/useHelmetHeadTracking";
import { useRememberedCredentials } from "../lib/loginCredentials";

/**
 * 第四版登录页：第一人称宇航员头盔 HUD + 破空流星视差主视觉 + 准直光学登录台
 */
export function LoginV4() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    method,
    setMethod,
    persistCredentials,
  } = useRememberedCredentials<HudLoginMethod>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sceneReady, setSceneReady] = useState(true);
  /** 本地 DEV_EMAIL_LOG_ONLY 时后端返回，不发真实邮件 */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [hudSettings, setHudSettings] = useState<HelmetHudSettings>(() =>
    loadHelmetHudSettings()
  );

  const handleSettingsChange = useCallback((next: HelmetHudSettings) => {
    setHudSettings(next);
    saveHelmetHudSettings(next);
  }, []);

  const handleSettingsReset = useCallback(() => {
    clearHelmetHudSettings();
    setHudSettings(DEFAULT_HELMET_HUD_SETTINGS);
  }, []);

  const {
    containerRef,
    headPoseRef,
    telemetry,
    setConsoleInteractive,
  } = useHelmetHeadTracking(hudSettings);

  const checkAuth = useAuthStore((s) => s.checkAuth);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);

  // 登录页对齐 HubPage 暗色曜石主题（#000000 底板 + hub-glass-dark 组件样式），卸载时恢复用户原本主题
  useLayoutEffect(() => {
    applyHubDisplayModeToDom("dark");
    return () => {
      applyHubDisplayModeToDom(useHubThemeStore.getState().displayMode);
    };
  }, []);

  // WebGL 卡住/失败时仍要露出登录表单，避免「无法登录」
  useEffect(() => {
    if (sceneReady) return;
    const timer = window.setTimeout(() => setSceneReady(true), 2500);
    return () => window.clearTimeout(timer);
  }, [sceneReady]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) {
      setError("请输入企业邮箱");
      return;
    }
    setError("");
    setDevCode(null);
    setSendingCode(true);
    try {
      const { data } = await api.post<{
        cooldown: number;
        devCode?: string;
        message?: string;
      }>("/api/auth/send-code", { email });
      setCodeSent(true);
      setCooldown(data.cooldown || 60);
      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode);
      }
    } catch (err: unknown) {
      setError(extractError(err, "验证码发送失败"));
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("请输入企业邮箱");
      return;
    }
    if (method === "code" && !code.trim()) {
      setError("请输入验证码");
      return;
    }
    if (method === "password" && !password) {
      setError("请输入密码");
      return;
    }
    persistCredentials();
    setError("");
    setLoading(true);
    try {
      if (method === "code") {
        await api.post("/api/auth/verify-code", { email, code });
      } else {
        await api.post("/api/auth/login/email", { email, password });
      }
      await checkAuth();
    } catch (err: unknown) {
      const msg = extractError(err, "登录失败");
      setError(msg);
      if (method === "code") {
        setCode("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setGuestLoading(true);
    try {
      await api.post("/api/auth/guest");
      await checkAuth();
    } catch (err: unknown) {
      setError(extractError(err, "游客登录失败"));
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="hub-shell-root fixed inset-0 overflow-hidden bg-black text-on-surface select-none"
    >
      {/* L0：全屏纯黑深空背景 + 响应头盔转头反向视差的破空流星主视觉 */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <MeteorHeroCanvas
          onReady={handleSceneReady}
          headPoseRef={headPoseRef}
          hudSettings={hudSettings}
        />
      </div>

      {/* 左上角隐藏式光学与饱和度调校面板（鼠标移近左上角显现，对齐 ASCII 登录页体验） */}
      <HelmetHudSettingsPanel
        settings={hudSettings}
        onChange={handleSettingsChange}
        onReset={handleSettingsReset}
      />

      {/* L1~L3：宇航员头盔曲面面罩光学层 + 航电准直遥测仪 + 天体捕获准星 */}
      <div
        className={`transition-opacity duration-700 ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <HelmetVisorOverlay telemetry={telemetry} />
      </div>

      {/* L4：画面中下方准直光学登录控制台，整体适度上移抬高画面视觉重心 */}
      <div
        className={`relative z-20 flex h-full w-full flex-col items-center justify-end pb-[17.5vh] sm:pb-[20vh] px-4 transition-all duration-700 ease-out ${
          sceneReady
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        <HudOpticalLoginConsole
          method={method}
          onMethodChange={(next) => {
            setMethod(next);
            setError("");
          }}
          email={email}
          onEmailChange={setEmail}
          code={code}
          onCodeChange={setCode}
          password={password}
          onPasswordChange={setPassword}
          onSendCode={handleSendCode}
          onSubmit={handleEmailLogin}
          onGuestLogin={handleGuestLogin}
          loading={loading}
          guestLoading={guestLoading}
          sendingCode={sendingCode}
          cooldown={cooldown}
          codeSent={codeSent}
          error={error}
          devCode={devCode}
          onInteractiveChange={setConsoleInteractive}
        />
      </div>

      {/* 初始加载过渡遮罩 */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-500 ease-out ${
          sceneReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden={sceneReady}
      >
        <Loader2 size={28} className="animate-spin text-white/75" />
      </div>
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "data" in err.response
  ) {
    const data = (err.response as { data: { detail?: string } }).data;
    return data.detail || fallback;
  }
  return fallback;
}
