/** 输入框左侧像素点阵图标（envelope / key），严格整数网格，禁用抗锯齿 */

type PixelIconProps = {
  className?: string;
};

export function PixelEnvelopeIcon({ className }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 14 11"
      width="100%"
      height="100%"
      className={`tactile-pixel-icon ${className ?? ""}`}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {/* 信封外框 */}
      <rect x="0" y="2" width="14" height="9" fill="currentColor" />
      <rect x="1" y="3" width="12" height="7" fill="#0b0b0e" />
      {/* 顶部折线 V */}
      <rect x="1" y="3" width="1" height="1" fill="currentColor" />
      <rect x="2" y="4" width="1" height="1" fill="currentColor" />
      <rect x="3" y="5" width="1" height="1" fill="currentColor" />
      <rect x="4" y="6" width="1" height="1" fill="currentColor" />
      <rect x="5" y="7" width="1" height="1" fill="currentColor" />
      <rect x="6" y="8" width="2" height="1" fill="currentColor" />
      <rect x="8" y="7" width="1" height="1" fill="currentColor" />
      <rect x="9" y="6" width="1" height="1" fill="currentColor" />
      <rect x="10" y="5" width="1" height="1" fill="currentColor" />
      <rect x="11" y="4" width="1" height="1" fill="currentColor" />
      <rect x="12" y="3" width="1" height="1" fill="currentColor" />
      {/* 上盖尖角 */}
      <rect x="6" y="0" width="2" height="1" fill="currentColor" />
      <rect x="5" y="1" width="1" height="1" fill="currentColor" />
      <rect x="8" y="1" width="1" height="1" fill="currentColor" />
      <rect x="4" y="2" width="1" height="1" fill="currentColor" />
      <rect x="9" y="2" width="1" height="1" fill="currentColor" />
    </svg>
  );
}

export function PixelKeyIcon({ className }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 14 11"
      width="100%"
      height="100%"
      className={`tactile-pixel-icon ${className ?? ""}`}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {/* 钥匙环 */}
      <rect x="0" y="2" width="6" height="6" fill="currentColor" />
      <rect x="1" y="3" width="4" height="4" fill="#0b0b0e" />
      {/* 钥匙杆 */}
      <rect x="5" y="4" width="8" height="2" fill="currentColor" />
      {/* 齿牙 */}
      <rect x="9" y="6" width="2" height="2" fill="currentColor" />
      <rect x="12" y="6" width="1" height="3" fill="currentColor" />
    </svg>
  );
}
