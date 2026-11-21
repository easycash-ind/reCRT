import { useState, useRef, useEffect } from "react";
import { useNavbarControls } from "../hooks/useSceneControls";
import { useAuthStore } from "../stores/useAuthStore";

interface NavbarProps {
  showPanel: boolean;
  onTogglePanel: () => void;
}

export function Navbar({ showPanel, onTogglePanel }: NavbarProps) {
  const ctrl = useNavbarControls();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  const outerStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: "flex",
    justifyContent: "center",
    height: 72,
    backgroundColor: ctrl.导航栏颜色 + alphaHex(ctrl.不透明度),
    backdropFilter: `blur(${ctrl.背景模糊度}px)`,
    WebkitBackdropFilter: `blur(${ctrl.背景模糊度}px)`,
    pointerEvents: "auto",
  };

  const innerStyle: React.CSSProperties = {
    width: ctrl.内容宽度,
    maxWidth: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    boxSizing: "border-box",
  };

  const btnPadding = `${ctrl.上}px ${ctrl.右}px ${ctrl.下}px ${ctrl.左}px`;

  const baseBtnStyle: React.CSSProperties = {
    fontFamily: '"Outfit", sans-serif',
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 500,
    color: ctrl.字体颜色,
    opacity: 0.8,
    padding: btnPadding,
    borderRadius: 9999,
    transition: "opacity 0.2s, background 0.2s, color 0.2s",
  };

  const activeBtnStyle: React.CSSProperties = {
    ...baseBtnStyle,
    background: "#ffffff",
    color: "#000000",
    opacity: 1,
  };

  return (
    <nav style={outerStyle}>
      <div style={innerStyle}>
      <span
        style={{
          fontFamily: '"Author Variable", Georgia, serif',
          fontSize: 24,
          fontWeight: 600,
          fontStyle: "italic",
          color: ctrl.字体颜色,
          letterSpacing: 1,
          userSelect: "none",
        }}
      >
        Creative Workshop
      </span>
      <div style={{ display: "flex", gap: ctrl.按钮间距 }}>
        {["Doc", "About", "Tools"].map((label) => (
          <button
            key={label}
            style={baseBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = "rgba(128,128,128,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.8";
              e.currentTarget.style.background = "none";
            }}
          >
            {label}
          </button>
        ))}
        <button
          style={showPanel ? activeBtnStyle : baseBtnStyle}
          onClick={onTogglePanel}
          onMouseEnter={(e) => {
            if (!showPanel) {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = "rgba(128,128,128,0.15)";
            }
          }}
          onMouseLeave={(e) => {
            if (!showPanel) {
              e.currentTarget.style.opacity = "0.8";
              e.currentTarget.style.background = "none";
            }
          }}
        >
          Control Panel
        </button>
        {user && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              style={{
                ...baseBtnStyle,
                opacity: 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
              onClick={() => setShowUserMenu((v) => !v)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(128,128,128,0.15)";
              }}
              onMouseLeave={(e) => {
                if (!showUserMenu) {
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  flexShrink: 0,
                }}
              />
              {user.name || user.email.split("@")[0]}
            </button>
            {showUserMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 140,
                  padding: "6px",
                  borderRadius: 10,
                  background: "rgba(30,30,30,0.85)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  zIndex: 100,
                }}
              >
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logout();
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 14px",
                    border: "none",
                    borderRadius: 6,
                    background: "none",
                    color: "#ff6b6b",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </nav>
  );
}

function alphaHex(opacity: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return a.toString(16).padStart(2, "0");
}
