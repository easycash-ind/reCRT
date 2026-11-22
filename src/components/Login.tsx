import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import {
  applyHubDisplayModeToDom,
  useHubThemeStore,
} from "../stores/useHubThemeStore";
import { CurrencyAsciiHeroCanvas } from "./CurrencyAsciiHeroCanvas";
import { SakuraAsciiHeroCanvas } from "./SakuraAsciiHeroCanvas";
import { AzaleaBioHeroCanvas } from "./AzaleaBioHeroCanvas";
import {
  VanitasAsciiHeroCanvas,
  VANITAS_SPECIMENS,
  type VanitasTelemetry,
} from "./VanitasAsciiHeroCanvas";
import {
  AsciiArtSettingsPanel,
  DEFAULT_ASCII_ART_SETTINGS,
  loadAsciiArtSettings,
  saveAsciiArtSettings,
  clearAsciiArtSettings,
  type AsciiArtSettings,
} from "./AsciiArtSettingsPanel";
import { TactileLoginConsole, type LoginMethod } from "./TactileLoginConsole";
import { LoginV4 } from "./LoginV4";
import { LoginIrisPage } from "./LoginIrisPage";
import { LoginCityPopPage } from "./LoginCityPopPage";
import {
  LoginStyleSwitcher,
  loadLoginStyleVariant,
  saveLoginStyleVariant,
  type LoginStyleVariant,
} from "./LoginStyleSwitcher";
import { useRememberedCredentials } from "../lib/loginCredentials";

/**
 * ASCII 矩阵 + 拟物化硬件登录控制台（支持「赛博枯荣循环」、「落樱解构·数字风洞」与「3D 五常货币符号」三模式）
 */
export function AsciiTactileLoginView({
  mode = "azalea",
}: {
  mode?: "azalea" | "vanitas" | "sakura" | "currency";
}) {
  const {
    email,
    setEmail,
    password,
    setPassword,
    method,
    setMethod,
    persistCredentials,
  } = useRememberedCredentials<LoginMethod>();
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
  const [asciiSettings, setAsciiSettings] = useState<AsciiArtSettings>(() =>
    loadAsciiArtSettings()
  );
  const [vanitasTelemetry, setVanitasTelemetry] = useState<VanitasTelemetry>({
    specimen: VANITAS_SPECIMENS[0],
    phaseLabel: "II. FLOURISH [夏·盛放沐光]",
    cycleProgress: 0.25,
  });

  const handleSettingsChange = useCallback((next: AsciiArtSettings) => {
    setAsciiSettings(next);
    saveAsciiArtSettings(next);
  }, []);

  const handleSettingsReset = useCallback(() => {
    clearAsciiArtSettings();
    setAsciiSettings(DEFAULT_ASCII_ART_SETTINGS);
  }, []);

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

  const handleClearError = useCallback(() => {
    setError("");
  }, []);

  return (
    <div className="hub-shell-root fixed inset-0 overflow-hidden bg-black text-on-surface select-none">
      {/* 左上角隐藏式视觉参数设置按钮与浮动调校面板 */}
      <AsciiArtSettingsPanel
        settings={asciiSettings}
        onChange={handleSettingsChange}
        onReset={handleSettingsReset}
        mode={mode}
      />

      {/* 全屏曜石黑底板 + 左侧 3D ASCII 艺术动画主舞台 */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-out ${
          sceneReady ? "opacity-100" : "opacity-0"
        }`}
      >
        {mode === "azalea" ? (
          <AzaleaBioHeroCanvas
            onReady={handleSceneReady}
            settings={asciiSettings}
          />
        ) : mode === "vanitas" ? (
          <VanitasAsciiHeroCanvas
            onReady={handleSceneReady}
            settings={asciiSettings}
            onTelemetryChange={setVanitasTelemetry}
          />
        ) : mode === "sakura" ? (
          <SakuraAsciiHeroCanvas
            onReady={handleSceneReady}
            settings={asciiSettings}
          />
        ) : (
          <CurrencyAsciiHeroCanvas
            onReady={handleSceneReady}
            settings={asciiSettings}
          />
        )}
      </div>

      {/* 前景双栏布局：左侧留白给 ASCII 主视觉，右侧垂直居中放置黑曜石毛玻璃登录组件 */}
      <div
        className={`relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col items-center justify-end px-5 pb-[5vh] lg:flex-row lg:items-center lg:justify-between lg:pl-12 lg:pr-6 lg:pb-0 xl:max-w-[1760px] xl:pl-16 xl:pr-8 2xl:pr-12 transition-all duration-700 ease-out ${
          sceneReady
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-3 pointer-events-none"
        }`}
      >
        {/* 左侧舞台占位区（桌面端占据左半幅视觉空间） */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden h-full flex-1 lg:flex lg:flex-col lg:justify-end lg:pb-10"
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[12px] tracking-[0.18em] text-white/28">
            {mode === "azalea" ? (
              <span>
                SPECIMEN // RHODODENDRON × PULCHRUM · 大紫杜鹃 · BIO-THERMAL PULSE
              </span>
            ) : mode === "vanitas" ? (
              <span>
                {`VANITAS // [${vanitasTelemetry.specimen.code}] ${vanitasTelemetry.specimen.latinName} · ${vanitasTelemetry.specimen.jpName} · ${vanitasTelemetry.phaseLabel}`}
              </span>
            ) : mode === "sakura" ? (
              <span>
                SPECIMEN // PRUNUS LANNESIANA · 河津桜 · KAWAZU-ZAKURA · ❀ ✿ ❁ ✾ ✦
              </span>
            ) : (
              /* 世界 Top20 经济体代表性货币符号 */
              <span>$ € £ ¥ ₹ ₽ ₩ ₺ ₴ ₱ ฿ ₪ ₫ ₦ ₸ ₡ ₮ ₲ ₵ ₿</span>
            )}
          </div>
        </div>

        {/* 右侧实物图层交互式登录台（基于火山引擎 AI 抠图底图 + 多状态切图图层驱动，向画面右侧适度平移） */}
        <div className="flex w-full justify-center lg:w-[620px] lg:shrink-0 lg:justify-end lg:translate-x-6 xl:w-[660px] xl:translate-x-10 2xl:translate-x-14">
          <TactileLoginConsole
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
            onErrorClear={handleClearError}
            devCode={devCode}
            tabPillGlow={asciiSettings.tabPillGlow}
          />
        </div>
      </div>

      {/* 初始加载过渡遮罩 */}
      {!sceneReady && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black"
          aria-hidden={sceneReady}
        >
          <Loader2 size={28} className="animate-spin text-white/75" />
        </div>
      )}
    </div>
  );
}

/**
 * 登录页统一承载组件（支持右上角自由切换多版本登录页）
 */
export function Login() {
  const [variant, setVariant] = useState<LoginStyleVariant>(() =>
    loadLoginStyleVariant()
  );

  const handleVariantChange = (next: LoginStyleVariant) => {
    setVariant(next);
    saveLoginStyleVariant(next);
  };

  return (
    <>
      {/* 右上角多版本样式切换栏 */}
      <LoginStyleSwitcher
        current={variant}
        onChange={handleVariantChange}
      />

      {/* 根据切换栏选中的版本渲染对应页面 */}
      {variant === "citypop" && <LoginCityPopPage />}
      {variant === "iris" && <LoginIrisPage />}
      {variant === "v4" && <LoginV4 />}
      {variant === "azalea" && <AsciiTactileLoginView mode="azalea" />}
      {variant === "vanitas" && <AsciiTactileLoginView mode="vanitas" />}
      {variant === "sakura" && <AsciiTactileLoginView mode="sakura" />}
      {variant === "ascii" && <AsciiTactileLoginView mode="currency" />}
    </>
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
