# reCRT

从 [hub-page](https://github.com/easycash-ind/hub-page) 拆分的 **Creative Workshop 多版本登录/启动页** 设计工程。

同步源分支：`release/20261121`（含 `feat(login): publish the multi-version login pages`）。

## 套件路由

| 路径 | 说明 |
|------|------|
| `/` | 套件列表 |
| `/production` | Hub 统一登录页（右上角 V4 / ASCII / V2 / V1 切换） |
| `/login/v4` | 流星头盔 HUD |
| `/login/ascii` | ASCII 矩阵 + 拟物硬件控制台 |
| `/login/v2` | 黑曜石流星 + 毛玻璃卡 |
| `/login/v1` | 经典 3D 浮动（SceneDecoration） |
| `/playground` | Leva 历史设计台 |
| `/scene` | 纯经典 3D 场景 |

## 运行

```bash
cd C:\Users\YUUKI\Documents\GitHub\reCRT
npm install
npm run dev
```

端口 **5175**。登录 API 为 Mock，无需 hub 后端。

## 资源与样式

- `src/assets/tactile-login/`、`brand-logos/` — 拟物 / ASCII 素材
- `src/styles/hub-glass-dark.css` — 暗色曜石 Glass（V2/V4/ASCII 依赖 `data-hub-theme=dark`）