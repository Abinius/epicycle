# Epicycle

[![CI](https://github.com/Abinius/epicycle/actions/workflows/ci.yml/badge.svg)](https://github.com/Abinius/epicycle/actions/workflows/ci.yml)
![纯前端](https://img.shields.io/badge/纯前端-零后端_·_不上传-3F6B4F)
![运行时依赖](https://img.shields.io/badge/运行时依赖-8_个_·_全_MIT-3F6B4F)
![Node](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5-6E9F18?logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.64-2EAD33?logo=playwright&logoColor=white)

上传一条 SVG 路径（或直接手绘一笔）→ 得到它的**傅里叶公式** → 冻结成资产 → 用任意数值重演 → 导出成品视频。

全部在浏览器本地计算：不上传、不收集、无需账号。

> 形，由圆生。

## 它是什么

- **C1 · 冻结公式**：把任意 SVG / 手绘线条换算成一组精确系数，动画就是这组系数的严格重构。冻结产出不可变的 `FourierAsset`——可存进本地资产库、可导出成 JSON、可重新导入、可反复演绎。
- **C2 · 数值重演**：以冻结资产为基底，把数值注入参数向量 θ 实时重演。三个层级：全局参数 / 单系数编辑 / 任意数字序列映射。
- **C3 · 导出**：WebCodecs + mp4-muxer 逐帧离屏渲染，导出的每一帧与预览逐帧一致。

此外：中英双语可切换、全键盘可操作（空格 / ↑↓ / ←→ / F / E，输入框里会让路）、320px 起的移动端可用、渲染异常有兜底错误页——全部仍然只在你的浏览器里跑。

## 现在做到哪了

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 脚手架 + CI 五项门禁 + 数学契约 | ✅ |
| M1 | 数学内核（FFT / 采样 / 渲染纯函数）+ 数值黄金样张 V-1…V-6 | ✅ |
| M2 | SVG 上传 + 手绘输入 + Worker + 冻结资产 + IndexedDB 资产库 | ✅ |
| M3 | 公式面板（KaTeX 代入式）+ 系数表 + 频谱 + 六个预置 | ✅ |
| M4 | C2 算子引擎（模式 X / L1 / L2 / 分享短码 / 模式 Y 派生 / Morph） | ✅ |
| M5 | C3 导出引擎（WebCodecs 出 MP4 + 降级链 + GIF / PNG 序列 + 导出面板） | ✅ |
| M6 | 打磨与上线（移动端 320px / 无障碍与键盘 / 中英双语 / 隐私页 / L3 序列注入） | ✅ |
| M6′ | 部署（配置已就绪 `vercel.json`，实际上线待域名与账号） | 🚧 |

## 快速开始

```bash
npm ci
npm run dev          # http://localhost:5173
```

Node 24（CI 用的版本）。Windows 上如果 vitest 起不来并报 `Cannot find native binding`，是 rolldown 的原生绑定下到了损坏文件——删掉 `node_modules/@rolldown/binding-win32-x64-msvc` 重新 `npm install` 即可。

## 门禁

| 命令 | 卡什么 |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit`，strict + `verbatimModuleSyntax` + `isolatedModules` |
| `npm run lint` | ESLint，**含「`core/` 不许 import 浏览器 API」这条架构约束** |
| `npm test` / `npm run coverage` | 单元测试 + 数值黄金样张 V-1…V-6；覆盖率阈值 90 / 85 / 90 / 90 |
| `npm run build` | 构建 + 体积门禁：`dist/assets` 下**全部** js+css 的 gzip 之和 ≤ 300 KB（CI 口径，含懒加载 chunk 与 worker） |
| `npm run e2e` | Playwright 端到端（本机浏览器通道不通时用 `PLAYWRIGHT_CHANNEL=msedge npm run e2e`） |
| `npm run check` | 上面四条串起来跑，CI 就是这四步再加 E2E |

**2026-10-15 实测**：289 个单测全绿，覆盖率 stmts 98.94 / branch 93 / funcs 100 / lines 99.36；Playwright 30 例通过。体积两个口径都给，免得跟 CI 对不上号——**真首屏**（主入口 + CSS）**≈115 KB**，**CI 口径**（`dist/assets` 全部 js+css 的 gzip 之和，含懒加载的 KaTeX、导出链路与 Worker）**≈224 KB**，预算 300 KB。这些数字会随开发变动，以 CI 为准。

## 三条不可动摇的架构约束

1. **`core/` 不 import 任何 UI / 浏览器 API**（只用 `Math`、`ArrayBuffer`、TypedArray）→ 可以 100% 单测，也可以整个搬到服务端做批量导出。
2. **`renderFrame(ctx, scene, t)` 是纯函数**：时间只从参数进来，禁止读时钟、随机数、模块级可变状态。这是「导出与预览逐帧一致」唯一可靠的地基。渲染器只依赖一个窄 `DrawTarget` 接口，所以能在 Node 里用录制桩做纯度测试。
3. **模式 X（系数域编辑）永不触发 DFT；模式 Y（形状域）只在 Worker 里重算**，且结果回写成一个新资产的派生，原资产不可变。

## 目录结构

```
public/           favicon.ico（浏览器图标）+ favicon.svg（界面左上角 LOGO），原样拷进 dist/
src/
├── core/          纯数学，零依赖零 DOM，覆盖率目标 100%
│   ├── types.ts       全产品的数据契约（Core 只依赖这一个文件）
│   ├── dft.ts         radix-2 实 FFT → Coefficient[]（负频率按 N−n 取）+ reconstructPoints（iDFT 重建，模式 Y 地基）
│   ├── sampler.ts     SVG path → 等弧长 N 点（解析 → 自适应细分 → 串接 → 重采样）
│   ├── svgtext.ts     纯文本扫描抽 <path>，不依赖 DOM
│   ├── epicycle.ts    (系数, θ) → 渲染场景，§2.4 全部算子
│   ├── renderer.ts    renderFrame 纯函数 + 窄 DrawTarget 接口
│   ├── asset.ts       资产的冻结 / 校验 / JSON 往返 / 量化短码 / 指纹
│   ├── share.ts       分享链接 ?a=&t= 编解码（短码 + theta，纯函数无 DOM）
│   ├── derive.ts      模式 Y 形状域派生：coeffs → 重建 → 几何变换 → 重 DFT → 派生资产
│   ├── morph.ts       双资产过渡：逐项线性插值 cₙ(w)，两端与公共网格
│   ├── export.ts      导出规划层（纯函数）：能力 → 降级链、时间轴、文件名、体积预估
│   ├── sequence.ts    L3 数值序列注入：一串数字 → 幅度槽 / 相位槽（线性 + 固定增益）
│   ├── strokes.ts     手绘笔迹 → SVG path 数据
│   ├── formulas.ts    解析生成器（圆 / 正方形 / 心形 / 星形）
│   └── presets.ts     六个预置（生成器 + 两条内建路径），与上传共用同一个采样器
├── engine/        与浏览器交互的那一层
│   ├── worker.ts      采样 + DFT + 模式 Y 派生跑在 Worker 里（Transferable、轮次丢包）
│   ├── useSvgWorker.ts / useDeriveWorker.ts
│   ├── useShortcuts.ts / useReducedMotion.ts / metrics.ts   键盘、降低运动量、本地性能留档
│   └── export/        四条导出通路（WebCodecs / MediaRecorder / GIF / PNG 序列）+ 能力探测
├── i18n/          中英双语：以中文原文为 key 的词典 + 诊断按编号映射
├── storage/       IndexedDB 资产库（只管存取，不碰资产语义）
└── components/    UI（自绘面板 + Tailwind，不引 UI 组件库）
```

（只列主要文件，不是全部。）

## 数学正确性怎么保证

所有数值断言都写成 `core/` 的单元测试，能在 PR 里看到具体数字，而不是靠「看着像」：

- **黄金样张 V-1…V-6**：单位圆 / 方波 / 心形重建 / 负频率叉积 / 相位斜坡 = 时间平移 / 渲染纯度（用录制式 `DrawTarget` 桩逐条比对绘制序列）。
- **±n 绝不合并**：坐标信号 `z = x + iy` 本身就是复数，DFT 没有实信号那种 `c_{-n} = conj(c_n)` 的对称性——圆的 `c₊₁ = 1` 而 `c₋₁ ≈ 0`，心形反过来。按 `|n|` 合并柱状图会编造出两个圆都不存在的幅度。所以频谱是**有符号频率的双半轴**。
- **「冻结 → 清空 → 重新导入 → 逐帧一致」**：E2E 在一个**全新的浏览器上下文**（IndexedDB 是空的）里导入刚导出的 JSON，再导出一次比对，两个文件**逐字节相同**。文本相同即系数全精度相同，而 `renderFrame` 又是纯函数，于是每一帧都相同。

## 设计文档

三份文档含商业内容，不随仓库分发（放在开发机上，代码与提交信息里引用时写作 `技术文档 §2.2` 这样的形式）：

- `傅里叶画板_产品需求文档PRD_v2.md`
- `傅里叶画板_开发计划_v2.md` —— M0–M6 里程碑、逐段出口标准、风险册，以及每一段的交付记录
- `傅里叶画板_技术栈与开发文档_v2.md` —— 架构 / 数学管线 / 资产模型 / 渲染 / 导出 / 错误诊断表

代码里引用它们时写作 `技术文档 §2.2` 这样的形式。

## 部署

纯静态站：`npm run build` 出 `dist/`，任何静态托管都能放。仓库里带了 `vercel.json`，包含 SPA 重写（分享链接 `?a=&t=` 与深链都落到 `index.html`）、安全响应头（CSP、`nosniff`、`DENY`、`no-referrer`）与静态资源长缓存。

```bash
vercel --prod     # 首次会要求登录并关联项目
```

⚠️ **CSP 在两处生效，但只有一个出处**：生产看 `vercel.json`；本地 E2E 跑的是 `vite preview`，它从 `vercel.json` 里读同一份 CSP 当响应头（见 `vite.config.ts`）。因此 E2E 里每条「无 console error」断言都顺带验了 CSP——**改 CSP 只改 `vercel.json`**，两边不会走岔。

两条实测出来的 CSP 约束，别顺手收紧：

- `font-src` 必须带 `data:`——KaTeX 的字体里有一个小到构建时被内联成 data URI。
- `style-src` 必须带 `'unsafe-inline'`——KaTeX 大量用 `style` 属性排版，去掉会挂掉 13 条 E2E。

## 许可证

**仓库公开，但不是开源。** 这里没有 LICENSE 文件，即保留所有权利（All rights reserved）。可以阅读、可以按 GitHub 的条款 fork，但没有被授予使用、修改、分发或商用的许可。

第三方依赖各自的许可证见 [THIRD-PARTY.md](THIRD-PARTY.md)，它们不受本节影响。

## 第三方

用到的全部第三方代码与许可证，见 **[THIRD-PARTY.md](THIRD-PARTY.md)** —— 会随产物进用户浏览器的只有 8 个包、全部 MIT，整个依赖树里没有任何 GPL / AGPL / SSPL / 未知许可证。
