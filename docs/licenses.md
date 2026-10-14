# 依赖许可复核

| 项 | 值 |
| --- | --- |
| 复核日期 | 2026-10-14 |
| 复核方式 | `npm view <pkg>` 读注册表元数据 + 读本地 `node_modules/*/package.json` 的 `license` 字段 |
| 结论 | **全部 MIT / Apache-2.0，无 GPL/AGPL/SSPL，无 LICENSE 缺失，可商用** |
| `npm audit` | 0 漏洞（high 0 / moderate 0） |

Apache-2.0 是宽松许可，与 MIT 同等可商用；本项目不需要专利条款之外的附加义务（不修改源码、不起诉），因此不需要额外标注。

---

## 1. 已安装（16 个）

| 依赖 | 版本 | 许可 | 作用 |
| --- | --- | --- | --- |
| react | 19.3.0 | MIT | UI 框架 |
| react-dom | 19.3.0 | MIT | 渲染入口 |
| katex | 0.19.0 | MIT | 公式排版（M3）。**懒加载**：`React.lazy` 引入，JS 与 CSS 落在独立 chunk（gzip 87 KB），不进首屏；自带 60 个字体文件，由浏览器按需下载 |
| vite | 8.3.4 | MIT | 构建（rolldown 底座） |
| @vitejs/plugin-react | 6.1.2 | MIT | JSX + HMR |
| tailwindcss | 4.3.3 | MIT | 样式（`@theme` 增量令牌） |
| @tailwindcss/vite | 4.3.3 | MIT | Tailwind v4 的 Vite 插件 |
| typescript | 5.9.3 | Apache-2.0 | 严格模式 |
| vitest | 5.0.4 | MIT | 单元 + 数值黄金样张 |
| @vitest/coverage-v8 | 5.0.4 | MIT | 覆盖率门禁 |
| eslint | 10.12.0 | MIT | Lint + 架构约束 |
| typescript-eslint | 8.71.2 | MIT | TS 规则集 |
| @eslint/js | 10.0.1 | MIT | `js.configs.recommended` |
| @playwright/test | 1.64.0 | Apache-2.0 | E2E 冒烟 |
| @types/react | 19.3.0 | MIT | 类型 |
| @types/react-dom | 19.3.0 | MIT | 类型 |

生产运行时依赖只有 `react` + `react-dom` + `katex`，全部在构建期打进 bundle（无运行时 CDN、无第三方字体服务）。构建产物 gzip：主入口 76 KB，KaTeX 懒加载 chunk 87 KB，CI 门禁口径（`dist/assets/` 下全部 JS+CSS）合计 158.5 KB（预算 300 KB）。

## 2. 后续里程碑才装（7 个，均已核对许可）

按开发计划逐个引入，避免未使用的依赖提前进包。

| 依赖 | 最新版本 | 许可 | 引入里程碑 | 备注 |
| --- | --- | --- | --- | --- |
| mathjs | 15.2.0 | Apache-2.0 | M3 自定义公式 | 体积大，**只允许在自定义公式面板里动态 `import()`**；若首屏预算吃紧，换 `expr-parser` 系轻量方案（引入前复核许可） |
| svg-pathdata | 9.0.0 | MIT | M2 采样 | 纯解析、无 DOM 依赖，符合 §13 安全口径（只解析 `d` 字符串，不把 SVG 插 DOM） |
| mp4-muxer | 5.2.2 | MIT | M5 导出 | 与原生 WebCodecs 配合 |
| gifenc | 1.0.3 | MIT | M5 GIF | 内置调色板量化 |
| fflate | 0.8.3 | MIT | M5 PNG 序列 | 纯 TS、无 WASM，体积很小 |
| idb-keyval | 6.3.0 | Apache-2.0 | M2 资产库 | IndexedDB 封装，零依赖 |

## 3. 明确排除（不要引入）

| 包 | 原因 |
| --- | --- |
| Remotion | 许可非标准（NOASSERTION），且需要 Node 服务端渲染，与「纯前端零后端」定位冲突 |
| indutny/fft.js | 仓库**没有 LICENSE 文件**，商用有风险 → 改自研 radix-2 实 FFT（约 120 行，已交付） |
| paper.js | 许可混合声明 + 2024-07 后无更新 + 体积大；只需要它的 `Path` 弧长语义，改自研弧长重采样（约 80 行） |
| ffmpeg.wasm | 核心 wasm 约 30 MB，装不进首屏预算；仅「无 WebCodecs 且必须 MP4」的极端场景才评估 |

## 4. 纪律

- 新增依赖前先跑一次许可核对，把结果补进第 1 节；**无 LICENSE 文件的包一律不引入**（这是 fft.js 被排除的唯一原因）。
- 首屏体积门禁写在 CI 里（gzip ≤ 300 KB），超限直接失败，不留到 M6 才发现。
- 重依赖（KaTeX / mathjs / mp4-muxer / gifenc）全部动态 `import()`，不进首屏。
- 不引状态管理库、不引 UI 组件库（6 个面板 `useReducer` + 自绘即可）。
