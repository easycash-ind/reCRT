import type { CSSProperties, ReactNode } from "react";

type PixelTextProps = {
  children?: ReactNode;
  text?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * 轻量像素字包装：直接使用本地嵌入的 Fusion Pixel（见 index.css @font-face）。
 * 不再做 canvas 二值化，避免碎裂/发糊。
 */
export function PixelText({ children, text, className, style }: PixelTextProps) {
  return (
    <span className={`tactile-pixel-text ${className ?? ""}`} style={style}>
      {children ?? text}
    </span>
  );
}
