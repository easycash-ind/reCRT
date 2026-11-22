import { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useRememberedCredentials } from "../lib/loginCredentials";

type IrisAuthMethod = "code" | "password";

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

/**
 * 嵌入在科研海报右下角 BAMRMOOTRD 排版段落中的无边框等宽文本流登录终端
 */
export function IrisInlineAuthBlock() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    method,
    setMethod,
    persistCredentials,
  } = useRememberedCredentials<IrisAuthMethod>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);

  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) {
      setError("ERR: EMAIL_REQUIRED");
      return;
    }
    setError("");
    setDevCode(null);
    setSendingCode(true);
    try {
      const { data } = await api.post<{
        cooldown: number;
        devCode?: string;
      }>("/api/auth/send-code", { email });
      setCooldown(data.cooldown || 60);
      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode);
      }
    } catch (err: unknown) {
      setError(extractError(err, "ERR: SEND_CODE_FAILED"));
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("ERR: EMAIL_REQUIRED");
      return;
    }
    if (method === "code" && !code.trim()) {
      setError("ERR: CODE_REQUIRED");
      return;
    }
    if (method === "password" && !password) {
      setError("ERR: PASS_REQUIRED");
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
      setError(extractError(err, "ERR: AUTH_REJECTED"));
      if (method === "code") setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError("");
    setGuestLoading(true);
    try {
      await api.post("/api/auth/guest");
      await checkAuth();
    } catch (err: unknown) {
      setError(extractError(err, "ERR: GUEST_FAILED"));
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-auto font-mono text-[10px] leading-[1.55] tracking-[0.12em] text-white/75"
    >
      {/* 标题行：完全对齐参考图右下角 BAMRMOOTRD 段落标题 */}
      <div className="mb-1.5 flex items-baseline justify-between border-b border-white/20 pb-1">
        <span className="text-[12px] font-semibold tracking-[0.22em] text-white/92">
          BAMRMOOTRD
        </span>
        <div className="flex items-center gap-2 text-[9px]">
          <button
            type="button"
            onClick={() => {
              setMethod("code");
              setError("");
            }}
            className={`cursor-pointer transition-colors ${
              method === "code"
                ? "text-cyan-300 underline underline-offset-4"
                : "text-white/40 hover:text-white/75"
            }`}
          >
            [01.CODE]
          </button>
          <span className="text-white/25">/</span>
          <button
            type="button"
            onClick={() => {
              setMethod("password");
              setError("");
            }}
            className={`cursor-pointer transition-colors ${
              method === "password"
                ? "text-cyan-300 underline underline-offset-4"
                : "text-white/40 hover:text-white/75"
            }`}
          >
            [02.PASS]
          </button>
        </div>
      </div>

      <div className="mb-1.5 text-[8.5px] leading-[1.35] text-white/42">
        SPECIMEN ACCESS NODE // IRIDACEAE-QS1508 · OPTICAL GATEWAY
      </div>

      {/* 邮箱行内输入 */}
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-white/15 pb-0.5 focus-within:border-cyan-300/70">
        <span className="shrink-0 text-[9px] text-white/45">ID_NODE:</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
          placeholder="operator@domain.org"
          autoComplete="email"
          className="w-full bg-transparent text-[10px] tracking-[0.08em] text-white/90 placeholder:text-white/22 focus:outline-none"
        />
      </div>

      {/* 验证码或密码行内输入 */}
      {method === "code" ? (
        <div className="mb-1.5 flex items-center gap-1.5 border-b border-white/15 pb-0.5 focus-within:border-cyan-300/70">
          <span className="shrink-0 text-[9px] text-white/45">SIG_KEY:</span>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError("");
            }}
            placeholder="6-DIGIT"
            className="w-full bg-transparent text-[10px] tracking-[0.16em] text-white/90 placeholder:text-white/22 focus:outline-none"
          />
          <button
            type="button"
            disabled={sendingCode || cooldown > 0}
            onClick={handleSendCode}
            className="shrink-0 cursor-pointer text-[9px] tracking-[0.14em] text-cyan-300/85 hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-white/30"
          >
            {sendingCode
              ? "[TX...]"
              : cooldown > 0
                ? `[${cooldown}S]`
                : "[TX_CODE]"}
          </button>
        </div>
      ) : (
        <div className="mb-1.5 flex items-center gap-1.5 border-b border-white/15 pb-0.5 focus-within:border-cyan-300/70">
          <span className="shrink-0 text-[9px] text-white/45">CIPHER :</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full bg-transparent text-[10px] tracking-[0.14em] text-white/90 placeholder:text-white/22 focus:outline-none"
          />
        </div>
      )}

      {/* 状态提示行（DevCode 或报错） */}
      {(error || devCode) && (
        <div className="mb-1 truncate text-[8.5px] tracking-[0.1em]">
          {error ? (
            <span className="text-amber-400/95">{error}</span>
          ) : (
            <span className="text-emerald-300/90">DEV_TOKEN // {devCode}</span>
          )}
        </div>
      )}

      {/* 底部行内指令触发器：看起来像科研参数表的底栏动作码 */}
      <div className="mt-1.5 flex items-center justify-between pt-0.5 text-[9.5px]">
        <button
          type="submit"
          disabled={loading || guestLoading}
          className="cursor-pointer font-semibold tracking-[0.18em] text-white/90 transition-colors hover:text-cyan-300 disabled:opacity-40"
        >
          {loading ? "[AUTHENTICATING...]" : "[EXEC_LOGIN ->]"}
        </button>
        <button
          type="button"
          disabled={loading || guestLoading}
          onClick={handleGuest}
          className="cursor-pointer tracking-[0.14em] text-white/45 transition-colors hover:text-white/85 disabled:opacity-40"
        >
          {guestLoading ? "[SYNC...]" : "[GUEST_PASS]"}
        </button>
      </div>
    </form>
  );
}
