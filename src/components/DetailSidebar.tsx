import { useEffect, useRef, useState } from "react";
import { useHoverModel } from "../hooks/useHoverModel";
import { useSidebarControls } from "../hooks/useSceneControls";

interface ModelDetail {
  title: string;
  developer: string;
  updated: string;
  url: string;
  body: string;
}

const MODEL_DETAILS: Record<string, ModelDetail> = {
  "top-left": {
    title: "Video Generator",
    developer: "Creative Workshop Team",
    updated: "2026-05-01",
    url: "https://example.com/video",
    body: `AI 驱动的视频生成工具，支持文字转视频、图片转视频等多种模式。只需输入一段描述，即可自动生成高质量短视频。\n\n主要功能：\n• 文字描述 → 视频片段\n• 图片序列 → 动态视频\n• 支持多种风格：写实、动画、水彩\n• 自动配乐与字幕生成\n• 最高支持 4K 分辨率输出`,
  },
  "top-right": {
    title: "Script Writer",
    developer: "Creative Workshop Team",
    updated: "2026-04-28",
    url: "https://example.com/script",
    body: `智能脚本撰写助手，为短视频、广告、播客等场景提供专业级文案。支持多种语言和风格切换。\n\n主要功能：\n• 一键生成完整脚本框架\n• 支持分镜头描述与旁白标注\n• 内置 SEO 关键词优化建议\n• 多语言翻译与本地化\n• 协作编辑，团队实时共享`,
  },
  "bottom-left": {
    title: "ImgAgent",
    developer: "Creative Workshop Team",
    updated: "2026-05-05",
    url: "https://example.com/imgagent",
    body: `全能图像处理 AI 代理，从生成、编辑到增强一站式搞定。支持自然语言指令操控图像。\n\n主要功能：\n• 文字描述 → 高质量图片生成\n• 智能抠图与背景替换\n• 图片风格迁移\n• 批量处理与自动化工作流\n• 支持 PSD 图层导出`,
  },
  "bottom-right": {
    title: "SEO Optimizer",
    developer: "Creative Workshop Team",
    updated: "2026-04-20",
    url: "https://example.com/seo",
    body: `一站式 SEO 优化平台，帮助网站提升搜索引擎排名与流量。AI 自动分析并给出优化建议。\n\n主要功能：\n• 关键词调研与竞争分析\n• 页面 SEO 健康度评分\n• 自动生成 meta 标签与结构化数据\n• 反向链接监控与机会发现\n• 实时排名追踪与报告`,
  },
};

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function DetailSidebar() {
  const { hoveredId } = useHoverModel();
  const ctrl = useSidebarControls();
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarHovered = useRef(false);

  const startHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 2000);
  };

  const cancelHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => {
    if (hoveredId) {
      cancelHideTimer();
      setActiveId(hoveredId);
      setVisible(true);
    } else if (!sidebarHovered.current) {
      startHideTimer();
    }
    return () => cancelHideTimer();
  }, [hoveredId]);

  const detail = activeId ? MODEL_DETAILS[activeId] : null;

  const bgGradient = `linear-gradient(to right, ${hexToRgba(ctrl.起始颜色, ctrl.起始不透明度)}, ${hexToRgba(ctrl.结束颜色, ctrl.结束不透明度)})`;

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: 0,
        width: ctrl.宽度,
        bottom: 0,
        zIndex: 5,
        pointerEvents: visible ? "auto" : "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        background: bgGradient,
        backdropFilter: `blur(${ctrl.背景模糊度}px)`,
        WebkitBackdropFilter: `blur(${ctrl.背景模糊度}px)`,
        overflowY: "auto",
        padding: `${ctrl.上}px ${ctrl.右}px ${ctrl.下}px ${ctrl.左}px`,
        boxSizing: "border-box",
        scrollbarWidth: "none",
      }}
      onMouseEnter={() => {
        sidebarHovered.current = true;
        cancelHideTimer();
      }}
      onMouseLeave={() => {
        sidebarHovered.current = false;
        if (!hoveredId) {
          startHideTimer();
        }
      }}
    >
      {detail && (
        <>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: 22,
              fontWeight: 700,
              color: ctrl.标题正文颜色,
            }}
          >
            {detail.title}
          </h2>
          <div
            style={{
              fontSize: 12,
              color: ctrl.次要文字颜色,
              marginBottom: 18,
              display: "flex",
              gap: 12,
            }}
          >
            <span>{detail.developer}</span>
            <span>更新于 {detail.updated}</span>
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              color: ctrl.标题正文颜色,
              margin: 0,
              whiteSpace: "pre-line",
            }}
          >
            {detail.body}
          </p>
          <a
            href={detail.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 20,
              fontSize: 14,
              fontWeight: 600,
              color: "#3d5afe",
              textDecoration: "none",
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #3d5afe",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#3d5afe";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#3d5afe";
            }}
          >
            打开工具 →
          </a>
        </>
      )}
      <style>{`
        div[style*="overflowY"]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
