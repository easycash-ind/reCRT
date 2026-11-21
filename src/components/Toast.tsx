import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  duration: number;
  onDone: () => void;
}

export function Toast({ message, duration, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const fadeOut = setTimeout(() => setVisible(false), duration - 400);
    const remove = setTimeout(onDone, duration);
    return () => {
      clearTimeout(fadeOut);
      clearTimeout(remove);
    };
  }, [duration, onDone]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 40,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#d32f2f",
        color: "#fff",
        padding: "12px 28px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        pointerEvents: "none",
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.35s ease",
        whiteSpace: "nowrap",
      }}
    >
      {message}
    </div>
  );
}
