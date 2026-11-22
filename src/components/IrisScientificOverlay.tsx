import type { RefObject } from "react";
import {
  HOLO_SPECIMENS,
  type HoloSpecimenId,
} from "./CrestedIrisHoloHeroCanvas";

/**
 * 全息植物科研解剖海报背景 SVG 网格、光谱折线图与实时跟随 3D 投影点的解剖引线层
 */
export function IrisScientificOverlay({
  svgRef,
  specimenId = "iris",
}: {
  svgRef?: RefObject<SVGSVGElement | null>;
  specimenId?: HoloSpecimenId;
}) {
  const meta = HOLO_SPECIMENS[specimenId];
  const titles = meta.calloutTitles;
  const subs = meta.calloutSubtitles;

  // 三株植物各自专属的左上光谱曲线与左下跨象限相位大弧线
  const topCurvePrimary =
    specimenId === "iris"
      ? "M 2 76 Q 28 112, 58 98 T 116 68 T 165 32 L 182 22"
      : specimenId === "orchid"
        ? "M 2 104 Q 34 42, 68 78 T 124 34 T 168 62 L 182 26"
        : "M 2 92 C 36 88, 62 36, 96 48 C 128 58, 152 24, 182 18";

  const topCurveSecondary =
    specimenId === "iris"
      ? "M 2 108 Q 42 114, 78 88 T 134 94 T 182 54"
      : specimenId === "orchid"
        ? "M 2 68 Q 48 116, 88 64 T 142 98 T 182 44"
        : "M 2 114 Q 52 72, 96 86 T 148 52 T 182 40";

  const bottomSplineMain =
    specimenId === "iris"
      ? "M 18 418 C 92 436, 165 548, 224 652 C 268 730, 326 756, 372 754 C 452 750, 504 676, 538 564 C 556 502, 578 486, 598 488"
      : specimenId === "orchid"
        ? "M 18 468 C 88 392, 162 496, 238 618 C 296 712, 368 748, 428 712 C 492 672, 528 588, 584 532"
        : "M 18 396 C 104 468, 178 612, 262 698 C 324 760, 412 738, 476 648 C 524 580, 558 518, 612 496";

  const bottomSplineSub =
    specimenId === "iris"
      ? "M 48 455 C 118 480, 185 575, 246 668 C 296 742, 376 742, 438 688"
      : specimenId === "orchid"
        ? "M 42 496 C 112 432, 188 538, 264 648 C 322 728, 392 732, 462 664"
        : "M 44 432 C 126 504, 198 632, 282 712 C 348 756, 424 718, 492 634";

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="iris-fine-grid"
          width="80"
          height="80"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 80 0 L 0 0 0 80"
            fill="none"
            stroke="rgba(255,255,255,0.065)"
            strokeWidth="0.75"
          />
          <path
            d="M 40 0 L 40 80 M 0 40 L 80 40"
            fill="none"
            stroke="rgba(255,255,255,0.025)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>

      {/* 中央主花区域背后的精密正交网格 */}
      <rect
        x="140"
        y="42"
        width="1320"
        height="726"
        fill="url(#iris-fine-grid)"
      />

      {/* 主结构体正交基准线 */}
      <g stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" fill="none">
        <line x1="158" y1="36" x2="158" y2="768" />
        <line x1="252" y1="36" x2="252" y2="215" />
        <line x1="1088" y1="36" x2="1088" y2="768" />
        <line x1="1332" y1="36" x2="1332" y2="768" />
        <line x1="24" y1="215" x2="430" y2="215" />
        <line x1="1040" y1="145" x2="1576" y2="145" />
        <line x1="1280" y1="340" x2="1576" y2="340" />
        <line x1="24" y1="566" x2="1332" y2="566" />
        <line x1="24" y1="768" x2="1576" y2="768" />
      </g>

      {/* 左上角光谱吸收双曲线图 (SPECTRAL INTERFERENCE CURVE) */}
      <g transform="translate(252, 56)">
        <line
          x1="0"
          y1="125"
          x2="185"
          y2="125"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="0.8"
        />
        <line
          x1="0"
          y1="20"
          x2="0"
          y2="125"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="0.8"
        />
        <path
          d={topCurvePrimary}
          fill="none"
          stroke="rgba(210,238,255,0.68)"
          strokeWidth="1.15"
        />
        <path
          d={topCurveSecondary}
          fill="none"
          stroke="rgba(148,196,255,0.38)"
          strokeWidth="0.9"
          strokeDasharray="3 2"
        />
        <circle cx="116" cy="68" r="2.2" fill="rgba(120,235,255,0.85)" />
        <circle cx="165" cy="32" r="2.2" fill="rgba(255,165,96,0.85)" />
      </g>

      {/* 左下角跨象限生物电容相位大弧线 */}
      <path
        d={bottomSplineMain}
        fill="none"
        stroke="rgba(238,198,176,0.48)"
        strokeWidth="1.15"
      />
      <path
        d={bottomSplineSub}
        fill="none"
        stroke="rgba(140,220,255,0.22)"
        strokeWidth="0.75"
        strokeDasharray="4 4"
      />

      {/* 实时跟随 3D 模型解剖位点投影坐标的引线与科研标注组 */}
      <g
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fontSize="8.5"
        letterSpacing="1.2"
      >
        {/* 01. 左上引线：跟随左上内花被片 3D 顶点 */}
        <g data-callout-anchor="0" transform="translate(542, 224)">
          <polyline
            points="0,0 -47,-42 -104,-42"
            fill="none"
            stroke="rgba(140,235,255,0.42)"
            strokeWidth="0.85"
          />
          <circle
            cx="0"
            cy="0"
            r="5"
            fill="none"
            stroke="rgba(110,240,255,0.45)"
            strokeWidth="0.75"
          />
          <circle cx="0" cy="0" r="2.2" fill="rgba(110,240,255,0.92)" />
          <rect
            x="-110"
            y="-54"
            width="2"
            height="19"
            fill="rgba(110,240,255,0.75)"
          />
          <text
            x="-116"
            y="-46"
            textAnchor="end"
            fill="rgba(255,255,255,0.82)"
            fontWeight="600"
          >
            {titles[0]}
          </text>
          <text
            x="-116"
            y="-35"
            textAnchor="end"
            fill="rgba(255,255,255,0.45)"
            fontSize="7.5"
          >
            {subs[0]}
          </text>
        </g>

        {/* 02. 右上引线：跟随中央直立流苏花柱冠 3D 顶点 */}
        <g data-callout-anchor="1" transform="translate(862, 168)">
          <polyline
            points="0,0 50,-50 106,-50"
            fill="none"
            stroke="rgba(196,150,255,0.42)"
            strokeWidth="0.85"
          />
          <circle
            cx="0"
            cy="0"
            r="5"
            fill="none"
            stroke="rgba(186,130,255,0.45)"
            strokeWidth="0.75"
          />
          <circle cx="0" cy="0" r="2.2" fill="rgba(186,130,255,0.92)" />
          <rect
            x="110"
            y="-62"
            width="2"
            height="19"
            fill="rgba(186,130,255,0.75)"
          />
          <text
            x="118"
            y="-54"
            textAnchor="start"
            fill="rgba(255,255,255,0.82)"
            fontWeight="600"
          >
            {titles[1]}
          </text>
          <text
            x="118"
            y="-43"
            textAnchor="start"
            fill="rgba(255,255,255,0.45)"
            fontSize="7.5"
          >
            {subs[1]}
          </text>
        </g>

        {/* 03. 花心引线：跟随花喉鸡冠状暖橙附属物 3D 顶点 */}
        <g data-callout-anchor="2" transform="translate(795, 453)">
          <polyline
            points="0,0 168,-212 244,-212"
            fill="none"
            stroke="rgba(255,168,92,0.45)"
            strokeWidth="0.85"
          />
          <circle
            cx="0"
            cy="0"
            r="5.5"
            fill="none"
            stroke="rgba(255,146,56,0.5)"
            strokeWidth="0.75"
          />
          <circle cx="0" cy="0" r="2.4" fill="rgba(255,146,56,0.95)" />
          <rect
            x="248"
            y="-224"
            width="2"
            height="19"
            fill="rgba(255,146,56,0.8)"
          />
          <text
            x="256"
            y="-216"
            textAnchor="start"
            fill="rgba(255,214,172,0.88)"
            fontWeight="600"
          >
            {titles[2]}
          </text>
          <text
            x="256"
            y="-205"
            textAnchor="start"
            fill="rgba(255,255,255,0.45)"
            fontSize="7.5"
          >
            {subs[2]}
          </text>
        </g>

        {/* 04. 右翼引线：跟随右侧外花被片平行等高流线 3D 顶点 */}
        <g data-callout-anchor="3" transform="translate(1128, 461)">
          <polyline
            points="0,0 36,-76 68,-76"
            fill="none"
            stroke="rgba(120,225,255,0.42)"
            strokeWidth="0.85"
          />
          <circle
            cx="0"
            cy="0"
            r="5"
            fill="none"
            stroke="rgba(96,225,255,0.45)"
            strokeWidth="0.75"
          />
          <circle cx="0" cy="0" r="2.2" fill="rgba(96,225,255,0.92)" />
          <rect
            x="72"
            y="-88"
            width="2"
            height="19"
            fill="rgba(96,225,255,0.75)"
          />
          <text
            x="80"
            y="-80"
            textAnchor="start"
            fill="rgba(255,255,255,0.82)"
            fontWeight="600"
          >
            {titles[3]}
          </text>
          <text
            x="80"
            y="-69"
            textAnchor="start"
            fill="rgba(255,255,255,0.45)"
            fontSize="7.5"
          >
            {subs[3]}
          </text>
        </g>

        {/* 05. 底部花梗与苞片引线：跟随花梗维管束与苞片节点 3D 顶点 */}
        <g data-callout-anchor="4" transform="translate(756, 795)">
          <polyline
            points="0,0 50,-68 112,-68"
            fill="none"
            stroke="rgba(110,235,148,0.48)"
            strokeWidth="0.9"
          />
          <circle
            cx="0"
            cy="0"
            r="5.5"
            fill="none"
            stroke="rgba(110,235,148,0.55)"
            strokeWidth="0.8"
          />
          <circle cx="0" cy="0" r="2.4" fill="rgba(110,235,148,0.95)" />
          <rect
            x="116"
            y="-80"
            width="2"
            height="19"
            fill="rgba(110,235,148,0.8)"
          />
          <text
            x="124"
            y="-72"
            textAnchor="start"
            fill="rgba(196,255,214,0.88)"
            fontWeight="600"
          >
            {titles[4]}
          </text>
          <text
            x="124"
            y="-61"
            textAnchor="start"
            fill="rgba(255,255,255,0.48)"
            fontSize="7.5"
          >
            {subs[4]}
          </text>
        </g>
      </g>

      {/* 右侧极坐标十字准星仪 */}
      <g
        transform="translate(1396, 376)"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="0.85"
      >
        <line x1="-42" y1="0" x2="42" y2="0" />
        <line x1="0" y1="-28" x2="0" y2="28" />
        <circle
          cx="0"
          cy="0"
          r="12"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
        />
        <circle cx="0" cy="0" r="2" fill="rgba(255,255,255,0.65)" />
      </g>
    </svg>
  );
}
