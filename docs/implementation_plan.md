# 扫描花卉 ASCII 登录页：模型诊断、视觉探索方案集与方案 1 实施计划

## 一、 扫描模型（`cc0__kawazu_sakura_prunus_lannesiana.glb`）底层诊断报告

通过脚本直接解析 `.glb` 二进制 Chunk 与 JSON Header，该摄影测量（Photogrammetry）扫描模型的底层数据特征如下：

| 维度 | 诊断结果 | 对 Web / ASCII 渲染的影响与对策 |
| :--- | :--- | :--- |
| **文件总大小** | `34.77 MB` | 几何顶点数据占 `33.23 MB`（`bufferView 0~2`），而樱花烘焙贴图（`bufferView 4`）仅 **`1.34 MB`**。通过脚本清洗与减面，可将体积压缩至 **`2.5 MB` ~ `4 MB`**。 |
| **节点与网格结构** | 共 14 个 Mesh：`Object_4`（归属 `_Cube_0` 节点，仅 24 顶点）+ `Object_6` ~ `Object_18`（归属 `QS1660-W01-1-1-perCamera3_1`，共 13 个分块） | `_Cube_0` 是画面右侧 `x ∈ [0.077, 0.087]` 的 **1cm 彩色魔方校准块**，必须在预处理或加载时直接剔除；主体樱花因为 16-bit 索引上限（65,535）被导出器平铺切分为 13 个 Chunk，总计约 **82 万顶点 / 72 万三角面**。 |
| **空间包围盒 (BBox)** | `min: [-0.061, -0.040, -0.043]`，`max: [0.058, 0.053, 0.049]`（单位：米，真实尺寸约 `12cm × 9.3cm × 9.2cm`） | 原始尺度极小（约 `0.12` 单位），而现有离屏舞台相机距离为 `z = 10.5`、目标尺寸约 `4.4` 单位，需在加载后自动归一化居中并放大约 **`36x ~ 40x`**。 |
| **材质属性隐患** | 带有 `"KHR_materials_unlit": {}` 扩展 | Three.js `GLTFLoader` 默认会将其解析为不受光影影响的 `MeshBasicMaterial`。必须将其转换为自定义 `ShaderMaterial` 或结合烘焙贴图与法线光照梯度的材质，才能驱动 ASCII 字符的大小与发光密度梯度。 |

---

## 二、 粘连花瓣拆分方案与“ASCII 蒙混过关”技术路线归档

针对摄影测量模型“花瓣、叶片、枝干拓扑粘连在一起”的痛点，归档以下两种后处理路线：

### 套路 A：着色器色彩语义分割 + 3D 细胞簇剥离（零建模成本，最契合 ASCII 蒙混过关）
1. **色彩语义软分割（HSV Color-Space Semantic Masking）**：
   - 虽然网格顶点相连，但烘焙贴图（`1.34 MB` JPEG）中的颜色信息天然区分了三大器官：
     - **粉白花瓣（Petals）**：高明度，且 $R > G$、$R \ge B$（粉白/樱花色相区）。
     - **翠绿叶片（Leaves）**：$G > R \times 1.15$ 且 $G > B \times 1.15$（叶绿素色相区）。
     - **褐木枝干（Branch）**：低明度、低饱和暖褐色。
   - 在自定义 Vertex/Fragment Shader 中实时读取贴图 RGB 计算器官权重：
     - **枝干权重 `wBranch`**：固定不动或仅随整体轻微呼吸。
     - **叶片权重 `wLeaf`**：赋予低频、较大振幅的微风摇曳（与左上角斜向光束 `windTime` 律动同步）。
     - **花瓣权重 `wPetal`**：赋予高频微颤与边缘受光强化。
2. **ASCII 字符矩阵如何完美“蒙混过关”实现飘落与生长**：
   - 传统 3D 渲染一旦硬拆连续网格，切口会出现明显的三角面锯齿与破洞。
   - 但在本项目的离屏渲染管线中，画面最终被量化为 `24 ~ 110` 行的等宽发光字符矩阵 + `64×64` 连续高斯光晕。
   - 我们只需在 3D 空间叠加一层围绕花冠游走的**独立 3D 花瓣簇粒子（或基于 3D Voronoi 晶格的花瓣碎片）**，让粒子从花冠高光区生成、随左上角斜向微风向右下角飘落。经过离屏渲染后，飘落的花瓣会自动转化为**闪烁飘零的粉色 ASCII 字符星尘（如 `❀` $\rightarrow$ `✿` $\rightarrow$ `*` $\rightarrow$ `·`）**，视觉上与花枝本体浑然一体、毫无破绽。

### 套路 B：Node 脚本离线预处理（清洗魔方 + 空间聚类减面）
- 编写纯 Node 脚本 `scripts/prepare-sakura-glb.mjs`，直接操作二进制 `.glb`：
  1. 彻底移除 `_Cube_0` 魔方节点及其对应的贴图（`bufferView 3`）；
  2. 对 13 个高密三角面分块执行均匀空间网格下采样/抽取（将 72 万三角面精简至约 **3.5 万 ~ 5 万三角面**），使输出文件 `public/kawazu_sakura_clean.glb` 体积从 `34.77 MB` 降至 **`2.5 MB ~ 3.5 MB`**，保证浏览器首屏秒开且不卡顿。

---

## 三、 5 大“赛博花卉 × 美院实验视觉”创意方向归档

1. **方向 1：【数字植物标本室 / Cyber Herbarium】—— 生物分类学 × 激光点云扫描（本次优先实施）**
   - **核心概念**：将扫描河津樱作为“被复古大型机捕获并数字化的生物标本”。
   - **字符集重构**：将货币符号替换为**植物花卉与基因学混合字符集**（按墨水密度升序：`· : - + * ✿ ❀ ❁ ✾` 及植物学分类字符）。
   - **视觉与动态**：
     - **周期性激光扫描面（Bio-Laser Scan Wave）**：一道高能荧光扫描波沿花枝自下而上（或沿斜向光束方向）扫过；未激活区呈现幽暗的冷翠/琥珀线框点阵感，扫描波掠过处激发樱花粉与嫩叶绿的饱满 HDR 字符辉光。
     - **色彩语义微风与飘落花瓣字符**：基于贴图色彩语义自动区分枝干、绿叶与粉花，赋予差异化风场摇曳，并伴随随风剥离飘落的樱花字符粒子。
     - **标本馆遥测注记**：左下角原本展示全球货币符号的装饰栏，同步支持显示植物标本分类学编号：`[SPECIMEN // PRUNUS LANNESIANA · KAWAZU-ZAKURA · SCAN_RES: 65532_PTS]`。
2. **方向 2：【故障花吹雪 / Glitch Hanami（赛博花见）】**
   - 强化左上角 7 道微风斜射光束与花枝风场的物理耦合，花瓣随强风阵发性剥离飘向右侧拟物金属登录台，并将登录台左侧边缘反光（`consoleBounceLight`）动态染上温柔的樱花粉色漫反射。
3. **方向 3：【形态发生学 / Morphogenesis】—— 枯荣循环与噪声生长场**
   - 基于顶点到枝干根部的空间测地距离 + 3D Simplex 噪声，演绎“枯枝蔓延 $\rightarrow$ 绿叶舒展 $\rightarrow$ 粉花盛放 $\rightarrow$ 信号过载化作荧光微粒消散”的四季枯荣循环。
4. **方向 4：【多光谱植物感知 / Multispectral Bio-Vision】**
   - 模拟紫外线诱导生物荧光摄影（UVIVF）与热成像光谱：在自然粉绿配色与“幽蓝菲涅尔花瓣边缘 + 洋红鎏金授粉花蕊”之间呼吸切换或随鼠标视差感应。
5. **方向 5：【断层体素雕塑 / Volumetric MRI Slicing】**
   - 利用粘连网格的整体雕塑感，用三维平行平面做实时动态等高线断层切片（Contour Slicing），交界处爆发出高亮字符环，如同复古实验室的全息断层投影仪。

---

## 四、 方案 1 分步实施计划（小步快跑策略）

> [!IMPORTANT]
> 为确保每一步响应迅速、零卡顿，我们将实施过程拆解为 **4 个独立的小步骤**，每一步控制在极小改动范围内并即时验证：

### Step 1：编写模型清洗与轻量化脚本（`scripts/prepare-sakura-glb.mjs`）
- **目标**：不引入沉重的第三方编译依赖，直接用纯 Node.js 解析 `C:\Users\YUUKI\Downloads\Downloads\cc0__kawazu_sakura_prunus_lannesiana.glb`：
  1. 剔除右侧魔方节点 `_Cube_0`（`Object_4`）及其纹理；
  2. 对 13 个樱花 Mesh 分块进行三角面抽稀（保留约 1/12 的三角面，即约 **6 万三角面**，在 512×512 离屏缓冲与 ASCII 网格下视觉完全无损），并重新计算居中归一化坐标；
  3. 输出轻量级 `public/kawazu_sakura_clean.glb`（预计体积仅 **`~3.2 MB`**，包含完整的 `1.34 MB` 高清烘焙贴图）。

---

### Step 2：创建【数字植物标本室】离屏 ASCII 渲染组件
#### [NEW] [SakuraAsciiHeroCanvas.tsx](file:///c:/Users/YUUKI/Documents/GitHub/reCRT/src/components/SakuraAsciiHeroCanvas.tsx)
- **复用成熟管线**：沿用 [CurrencyAsciiHeroCanvas.tsx](file:///c:/Users/YUUKI/Documents/GitHub/reCRT/src/components/CurrencyAsciiHeroCanvas.tsx) 中经过验证的零重影 `64×64` 高斯光晕缓冲、CRT 矩阵扫描线、左上角微风斜射光束以及右侧登录台边缘反光逻辑。
- **核心创新点（方案 1 + 套路 A）**：
  1. **植物标本字符图集（Botanical & Herbarium Glyph Atlas）**：构建由疏到密的植物学/花卉符号图集（`·`, `:`, `-`, `+`, `*`, `✿`, `❀`, `❁`, `✾`, `❖` 等，自动测量像素墨水密度排序）。
  2. **自定义标本着色器（`sakuraSpecimenMaterial`）**：
     - 解决原始 GLB `KHR_materials_unlit` 不受光的问题：读取烘焙贴图颜色，自动分离**粉白花瓣**、**翠绿叶片**与**褐木枝干**；
     - **色彩语义风场驱动**：在 Vertex Shader 中根据像素/顶点区域赋予叶片低频风摆、花瓣高频轻颤；
     - **周期性生物激光扫描波（Laser Scan Plane）**：一道柔和的高亮扫描面沿花枝周期性掠过，扫描面处呈现高亮荧光边缘与网格激活态。
  3. **飘落樱花字符粒子层（Falling Petal Cluster Particles）**：在花枝周围生成 ~45 枚随左上角斜向微风飘落的 3D 花瓣粒子，在离屏渲染中自然化作飘零的粉色 ASCII 字符。

---

### Step 3：接入登录页右上角样式切换器与左下角标本铭牌
#### [MODIFY] [LoginStyleSwitcher.tsx](file:///c:/Users/YUUKI/Documents/GitHub/reCRT/src/components/LoginStyleSwitcher.tsx)
- 在 `LoginStyleVariant` 中新增 `"sakura"`（**ASCII 赛博标本**，并将其设为可直接一键切换对比的选项，保留原有的 `"ascii"` 五常货币版与 `"v4"` 流星头盔版，方便随时对比切换）。

#### [MODIFY] [Login.tsx](file:///c:/Users/YUUKI/Documents/GitHub/reCRT/src/components/Login.tsx)
- 当选中 `"sakura"` 模式时，背景渲染 `SakuraAsciiHeroCanvas`，并将左下角的装饰铭牌切换为植物标本遥测信息：
  `SPECIMEN // PRUNUS LANNESIANA (KAWAZU-ZAKURA) · BIO-ASCII MATRIX // ✿ ❀ ❁ ✾`

---

### Step 4：构建与验证（Verification Plan）
1. 运行 `node scripts/prepare-sakura-glb.mjs` 验证生成的 `public/kawazu_sakura_clean.glb` 体积与结构（确认魔方已剔除、体积 < 4MB）。
2. 运行 `npm run build`（即 `tsc -b && vite build`）验证 TypeScript 类型检查与打包零报错。
3. 启动本地开发预览，检查河津樱 ASCII 矩阵的色彩还原度、微风吹拂花瓣飘落效果以及激光扫描波动态表现。
