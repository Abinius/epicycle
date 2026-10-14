# 第三方清单

傅里叶画板用到的全部第三方代码及其许可证。

**数据来源**：遍历 `node_modules` 里每个包的 `package.json` 实测得到，不是凭记忆写的。生成方法见文末。

**结论：会随产物进用户浏览器的包只有 5 个，全部 MIT。整个依赖树里没有任何 GPL / AGPL / SSPL / 未知许可证。**

---

## 一、运行时依赖（打进产物、在用户浏览器里执行）

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| katex | 0.19.0 | MIT | 公式代入式排版（懒加载，不进首屏 chunk） |
| react | 19.3.0 | MIT | UI |
| react-dom | 19.3.0 | MIT | UI |
| scheduler | 0.28.0 | MIT | React 的调度器（react-dom 的传递依赖） |
| svg-pathdata | 9.0.0 | MIT | 只做 SVG path 的解析与指令归一化；弧长细分与重采样是自研的 |

> 注：`katex` 的 `package.json` 里还声明了一个运行期依赖 `commander@15.0.0`（MIT），那是它自带命令行工具用的。我们只 `import` 它的 JS 模块，打包时不会带进来——**实测过**：在 `dist/assets/*.js` 里搜不到 commander 的任何字样。所以进产物的就是上表这 5 个。

## 二、开发与构建依赖（不随产物分发）

| 包 | 版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| @eslint/js | 10.0.1 | MIT | Lint 规则集 |
| @playwright/test | 1.64.0 | Apache-2.0 | 端到端测试 |
| @tailwindcss/vite | 4.3.3 | MIT | Tailwind 的 Vite 插件 |
| tailwindcss | 4.3.3 | MIT | 样式（构建期编译成纯 CSS，产物里没有它的运行时代码） |
| typescript | 5.9.3 | Apache-2.0 | 类型检查（`tsc --noEmit`） |
| typescript-eslint | 8.71.2 | MIT | TypeScript 的 ESLint 规则 |
| eslint | 10.12.0 | MIT | Lint |
| vite | 8.3.4 | MIT | 开发服务器与构建（rolldown 底座） |
| vitest | 5.0.4 | MIT | 单元测试 |
| @vitest/coverage-v8 | 5.0.4 | MIT | 覆盖率（走 V8 原生） |
| @vitejs/plugin-react | 6.1.2 | MIT | React 的 Vite 插件 |
| @types/node | 26.6.5 | MIT | 类型声明（仅编译期） |
| @types/react | 19.3.0 | MIT | 类型声明（仅编译期） |
| @types/react-dom | 19.3.0 | MIT | 类型声明（仅编译期） |

## 三、传递依赖（150 个，按许可证归组）

这些是上面两批包的依赖，不直接写在 `package.json` 里，但装在 `node_modules` 中。按许可证分组，组内按包名字典序。

**MIT**（114 个）

- `@babel/helper-string-parser@7.29.7`
- `@babel/helper-validator-identifier@7.29.7`
- `@babel/parser@7.29.9`
- `@babel/types@7.29.8`
- `@bcoe/v8-coverage@1.0.2`
- `@cacheable/memory@2.2.0`
- `@cacheable/utils@2.5.0`
- `@eslint-community/eslint-utils@4.10.1`
- `@eslint-community/regexpp@4.12.2`
- `@jridgewell/gen-mapping@0.3.13`
- `@jridgewell/remapping@2.3.5`
- `@jridgewell/resolve-uri@3.1.2`
- `@jridgewell/sourcemap-codec@1.6.0`
- `@jridgewell/trace-mapping@0.3.31`
- `@keyv/bigmap@1.3.1`
- `@keyv/serialize@1.1.1`
- `@oxc-project/types@0.153.0`
- `@rolldown/binding-win32-x64-msvc@1.2.13`
- `@rolldown/pluginutils@1.0.1`
- `@tailwindcss/node@4.3.3`
- `@tailwindcss/oxide@4.3.3`
- `@tailwindcss/oxide-win32-x64-msvc@4.3.3`
- `@types/chai@5.2.3`
- `@types/deep-eql@4.0.2`
- `@types/esrecurse@4.3.1`
- `@types/estree@1.0.9`
- `@types/json-schema@7.0.15`
- `@typescript-eslint/eslint-plugin@8.71.2`
- `@typescript-eslint/parser@8.71.2`
- `@typescript-eslint/project-service@8.71.2`
- `@typescript-eslint/scope-manager@8.71.2`
- `@typescript-eslint/tsconfig-utils@8.71.2`
- `@typescript-eslint/type-utils@8.71.2`
- `@typescript-eslint/types@8.71.2`
- `@typescript-eslint/typescript-estree@8.71.2`
- `@typescript-eslint/utils@8.71.2`
- `@typescript-eslint/visitor-keys@8.71.2`
- `@vitest/istanbul-lib-coverage@1.0.2`
- `@vitest/istanbul-lib-report@1.0.2`
- `@vitest/mocker@5.0.4`
- `@vitest/spy@5.0.4`
- `acorn@8.19.0`
- `acorn-jsx@5.3.2`
- `ajv@6.15.0`
- `assertion-error@2.0.1`
- `ast-v8-to-istanbul@1.0.7`
- `balanced-match@4.0.4`
- `brace-expansion@5.0.12`
- `cacheable@2.5.0`
- `chai@6.3.0`
- `commander@15.0.0`
- `cross-spawn@7.0.6`
- `csstype@3.2.3`
- `debug@4.4.3`
- `deep-is@0.1.4`
- `enhanced-resolve@5.26.0`
- `es-module-lexer@2.3.2`
- `escape-string-regexp@4.0.0`
- `estree-walker@3.0.3`
- `fast-deep-equal@3.1.3`
- `fast-json-stable-stringify@2.1.0`
- `fast-levenshtein@2.0.6`
- `fdir@6.5.0`
- `file-entry-cache@11.1.5`
- `find-up@5.0.0`
- `flat-cache@6.1.23`
- `hashery@1.5.1`
- `hookified@1.15.1`
- `hookified@2.2.0`
- `ignore@7.0.12`
- `ignore@5.3.2`
- `imurmurhash@0.1.4`
- `is-extglob@2.1.1`
- `is-glob@4.0.3`
- `jiti@2.7.0`
- `js-tokens@10.0.0`
- `json-schema-traverse@0.4.1`
- `json-stable-stringify-without-jsonify@1.0.1`
- `keyv@5.6.0`
- `levn@0.4.1`
- `locate-path@6.0.0`
- `magic-string@0.30.21`
- `magic-string@1.4.3`
- `magicast@0.5.5`
- `ms@2.1.3`
- `nanoid@3.3.20`
- `natural-compare@1.4.0`
- `obug@3.0.0`
- `optionator@0.9.4`
- `p-limit@3.1.0`
- `p-locate@5.0.0`
- `path-exists@4.0.0`
- `path-key@3.1.1`
- `picomatch@4.0.7`
- `postcss@8.5.30`
- `prelude-ls@1.2.1`
- `punycode@2.3.1`
- `qified@0.10.1`
- `rolldown@1.2.13`
- `scheduler@0.28.0`
- `shebang-command@2.0.0`
- `shebang-regex@3.0.0`
- `std-env@4.3.0`
- `tapable@2.3.3`
- `tinybench@6.2.2`
- `tinyexec@1.3.1`
- `tinyglobby@0.2.17`
- `tinyrainbow@3.2.0`
- `ts-api-utils@2.5.0`
- `type-check@0.4.0`
- `undici-types@8.9.0`
- `why-is-node-running@3.2.1`
- `word-wrap@1.2.5`
- `yocto-queue@0.1.0`

**Apache-2.0**（16 个）

- `@eslint/config-array@0.23.5`
- `@eslint/config-helpers@0.7.0`
- `@eslint/core@1.2.1`
- `@eslint/object-schema@3.0.5`
- `@eslint/plugin-kit@0.7.3`
- `@humanfs/core@0.19.2`
- `@humanfs/node@0.16.8`
- `@humanfs/types@0.15.0`
- `@humanwhocodes/module-importer@1.0.1`
- `@humanwhocodes/retry@0.4.3`
- `detect-libc@2.1.2`
- `eslint-visitor-keys@3.4.3`
- `eslint-visitor-keys@5.0.1`
- `expect-type@1.4.0`
- `playwright@1.64.0`
- `playwright-core@1.64.0`

**ISC**（7 个）

- `flatted@3.4.4`
- `glob-parent@6.0.2`
- `graceful-fs@4.2.11`
- `isexe@2.0.0`
- `picocolors@1.1.1`
- `semver@7.8.5`
- `which@2.0.2`

**BSD-2-Clause**（6 个）

- `eslint-scope@9.1.2`
- `espree@11.2.0`
- `esrecurse@4.3.0`
- `estraverse@5.3.0`
- `esutils@2.0.3`
- `uri-js@4.4.1`

**MPL-2.0**（4 个）

- `lightningcss@1.32.0`
- `lightningcss@1.33.0`
- `lightningcss-win32-x64-msvc@1.32.0`
- `lightningcss-win32-x64-msvc@1.33.0`

**BSD-3-Clause**（2 个）

- `esquery@1.7.0`
- `source-map-js@1.2.2`

**BlueOak-1.0.0**（1 个）

- `minimatch@10.2.6`
## 四、需要留意的许可证

- **MPL-2.0（4 个）**：`lightningcss` 与它的平台二进制（`lightningcss-win32-x64-msvc`），各两个版本。这是 Tailwind v4 / Vite 在构建期用来转换 CSS 的。MPL 是**文件级弱 copyleft**——只要不修改它的源文件、也不把它作为独立库再分发，就没有额外义务。实测它**不在**打进产物的闭包里（闭包只有第一节那 5 个 MIT 包），只在构建机上跑。
- **Apache-2.0（16 个）**：宽松许可，额外义务是保留声明与 NOTICE 文件。全部落在开发依赖一侧（ESLint 生态、Playwright、TypeScript），不进产物。
- **BlueOak-1.0.0（1 个）**：`minimatch`（ESLint 的传递依赖）。OSI 认可的宽松许可，无额外义务。

## 五、评估后明确不采用的第三方

记在这里，是为了以后有人想引入时知道当初为什么没要——**其中两条是许可原因**。

| 候选 | 为什么不要 |
| --- | --- |
| fft.js | **仓库没有 LICENSE 文件**，法律上不可商用。改为自研 radix-2 实 FFT（约 120 行，N 恒为 2 的幂，不需要 Bluestein） |
| paper.js | 许可为混合声明，且 2024-07 之后停更。只需要它的弧长语义，自研约 80 行且可单测 |
| Remotion | **许可非标准**（GitHub 标记为 NOASSERTION），需单独过法务；且它要求 Node 服务端渲染，与「纯前端零后端」的定位直接冲突 |
| ffmpeg.wasm | 许可没问题（MIT），但核心 wasm 约 30 MB，首屏预算（300 KB）装不下。只在「浏览器端必须出 MP4 且没有 WebCodecs」这种极端场景再评估 |
| Three.js / PixiJS | 2D 的圆 + 线用 Canvas 2D 足够；K > 500 才值得评估 WebGL |
| d3 | 不需要数据绑定，频谱柱状图自绘约 30 行 |
| idb-keyval | 实际只需要 put / getAll / delete 三个动作，用原生 IndexedDB 包一层 promise 即可，省一个运行时依赖 |
| mathjs | 体积大。L3「自定义公式 x(t)/y(t)」还没做，做的时候动态加载；若体积不过关换轻量表达式解析方案 |

另外两条不引依赖的纪律（写在技术文档的「精简纪律」里）：**不引状态管理库**（`useReducer` + Context 足够）、**不引 UI 组件库**（自绘面板 + Tailwind）。

## 生成方法

清单一节不漏来自下面这段脚本（读每个包的 `package.json`，而不是读某个清单文件）：

```bash
node -e "
const fs=require('fs'),path=require('path');const found=new Map();
function readPkg(d){try{const p=JSON.parse(fs.readFileSync(path.join(d,'package.json'),'utf8'));
if(!p.name||!p.version)return null;let l=p.license;
if(!l&&Array.isArray(p.licenses))l=p.licenses.map(x=>typeof x==='string'?x:x.type).join(' OR ');
return{name:p.name,version:p.version,license:l||'UNKNOWN'}}catch{return null}}
function walk(d){let es;try{es=fs.readdirSync(d,{withFileTypes:true})}catch{return}
for(const e of es){if(!e.isDirectory())continue;const f=path.join(d,e.name);
if(e.name==='node_modules'||e.name.startsWith('@')){walk(f);continue}
const p=readPkg(f);if(p)found.set(p.name+'@'+p.version,p);walk(path.join(f,'node_modules'))}}
walk(path.join(process.cwd(),'node_modules'));
for(const p of [...found.values()].sort((a,b)=>a.name.localeCompare(b.name)))console.log(p.name+'\t'+p.version+'\t'+p.license);
"
```

复现：在仓库根目录跑，输出应与本文第三节一致；不一致说明依赖变了，应当同步更新本文件。
