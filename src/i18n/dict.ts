import type { Diagnostic, Severity } from '../core/diagnostic.js'

export type Lang = 'zh' | 'en'

/**
 * 界面文案的英文词典，**以中文原文为 key**（gettext 那套）：组件里照常写中文，
 * `t()` 查得到就换英文、查不到原样返回。好处是组件保持可读、同一个词天然共用一条翻译；
 * 代价是改了中文原文就等于换了 key，英文会悄悄退回中文——所以有一条
 * 「英文模式下界面不该再出现汉字」的 E2E 兜着。
 *
 * 键一律加引号：中文标点与 `{}` 都不是合法的标识符字符，裸写是语法错误。
 *
 * core/ 的契约不动：诊断文案仍由 core 出中文，英文按**稳定的编号**在这里映射
 * （见下方 DIAGNOSTIC_EN 与 diagnosticText）。
 */
const EN: Record<string, string> = {
  // ---- 通用 / 顶栏 / 页脚 ----
  '形，由圆生。': 'Form, born of circles.',
  当前: 'Current',
  播放: 'Play',
  暂停: 'Pause',
  重置: 'Reset',
  复位: 'Reset',
  关闭: 'Close',
  清除: 'Clear',
  删除: 'Delete',
  打开: 'Open',
  导出: 'Export',
  导入: 'Import',
  分享链接: 'Share link',
  生成并复制: 'Create & copy',
  '已复制！': 'Copied!',
  手绘: 'Draw',
  形状: 'Shape',
  预置形状: 'Preset shape',
  渲染画布: 'Canvas',
  '全部在浏览器本地计算，不上传、不收集、无需账号':
    'Everything runs locally in your browser — nothing is uploaded or collected, no account needed.',
  关于与帮助: 'About & help',
  友情链接: 'Links',
  '七月的角落': "July's Corner",

  // ---- 素材 ----
  素材来源: 'Source',
  素材: 'Source',
  上传: 'Upload',
  '上传 SVG': 'Upload SVG',
  '上传 SVG 文件': 'Upload SVG file',
  '换一个 SVG': 'Replace SVG',
  清除上传: 'Clear upload',
  手绘区: 'Drawing area',
  撤销上一笔: 'Undo stroke',
  清空: 'Clear all',
  '采样点数 N': 'Sample count N',
  闭合方式: 'Closure',
  只取最长子路径: 'Longest subpath only',
  直线闭合: 'Straight close',
  镜像回扫: 'Mirror rescan',
  '{n} 笔': '{n} strokes',
  '{name} · {n} 条 path': '{name} · {n} paths',
  ' · {n} 段折线': ' · {n} subpaths',
  '上传含 <path> 的 SVG；直接把路径数据（以 M 开头）存成 .svg 或 .txt 也能用。':
    'Upload an SVG containing <path>. You can also save raw path data (starting with M) as .svg or .txt.',
  '预检未通过，画面仍是当前预置形状。': 'Preflight failed; the canvas still shows the current preset.',
  预检诊断: 'Preflight',
  预检未通过: 'Preflight failed',
  错误: 'Error',
  注意: 'Warning',
  提示: 'Note',

  // ---- L1 参数 ----
  参数面板: 'Parameters',
  参数: 'Parameters',
  '项数 K': 'Terms K',
  '参与合成的圆个数，按振幅从大到小取。形状自带频谱时，K 再大也不会长出新的圆。':
    'How many circles take part, largest amplitude first. If the shape’s spectrum is band-limited, a larger K adds nothing.',
  轨迹比例: 'Trail length',
  整体缩放: 'Scale',
  '等权化时是所有圆的统一半径；其余模式只移动质心位置。':
    'Under equalize, the shared radius of every circle; otherwise it only moves the centroid.',
  '全局相位 (弧度)': 'Global phase (rad)',
  '周期 T (秒)': 'Period T (s)',
  播放速度: 'Speed',
  '相位斜坡 β': 'Phase ramp β',
  'Δφ_n = β·n，等价于时间平移 β/2π。': 'Δφ_n = β·n, equivalent to a time shift of β/2π.',
  频段过滤: 'Band filter',
  频段模式: 'Band mode',
  全频: 'All',
  低通: 'Low-pass',
  高通: 'High-pass',
  截止频率: 'Cutoff',
  '等权化（所有圆同半径）': 'Equalize (all circles same radius)',
  '降低运动量（动画减半，默认跟随系统偏好）': 'Reduce motion (half speed; follows your system setting by default)',
  键盘快捷键: 'Keyboard shortcuts',

  // ---- L2 系数编辑 ----
  '编辑频率 n={n}': 'Edit n={n}',
  '半径 {r}，相位 {deg}°': 'radius {r}, phase {deg}°',
  '幅度倍率 γ': 'Amplitude × γ',
  '相位偏移 Δφ (弧度)': 'Phase offset Δφ (rad)',
  隐藏此项: 'Hide this term',
  '该频率已被隐藏或过滤，调高倍率可恢复。':
    'This frequency is hidden or filtered out; raise the multiplier to bring it back.',

  // ---- 公式 / 频谱 ----
  傅里叶公式: 'Fourier formula',
  公式: 'Formula',
  符号式: 'Symbolic',
  系数表: 'Coefficient table',
  贡献: 'share',
  '{k} 项 · 共 {m} 个系数': '{k} terms · {m} coefficients in all',
  '常数项 c_0：路径质心，不旋转': 'Constant term c_0 — the path centroid, no rotation',
  '系数 n={n}，半径 {r}，相位 {deg} 度，贡献度 {w}%':
    'coefficient n={n}, radius {r}, phase {deg}°, share {w}%',
  '第 {i} 大项：半径 {r}，相位 {deg}°': 'Term #{i}: radius {r}, phase {deg}°',
  '另有 {n} 项未展开': '{n} more terms not expanded',
  '这个形状没有可参与的项。': 'This shape has no terms to work with.',
  '点公式或表格里的一项，画面只显示它之前的圆链，再点一次恢复。n 为负是反向旋转。':
    'Click a term in the formula or the table and the drawing stops there; click again to restore. A negative n spins backwards.',
  振幅频谱: 'Amplitude spectrum',
  频谱: 'Spectrum',
  '峰值 {v}': 'peak {v}',
  '频率 n={n}，振幅 {mag}，{rest}': 'n={n}, amplitude {mag}, {rest}',
  被项数截断: 'cut off by K',
  '参与（系数表第 {i} 项）': 'active (row {i} of the table)',
  '这个形状没有可参与的频率。': 'This shape has no frequencies to work with.',
  '左半轴 −n 反向旋转，右半轴 +n 正向旋转，柱高是 |c_n|。亮色是当前参与的项，暗色被项数 K 截断；点一根柱，画面只画到它为止。':
    'The left half-axis is −n (spinning backwards), the right is +n; bar height is |c_n|. Lit bars are active, dim ones are cut off by K. Click a bar and the drawing stops at that term.',
  '共 {n} 个非零系数，这里显示 |n| ≤ {top} 的部分。':
    '{n} non-zero coefficients in all; showing the part with |n| ≤ {top}.',

  // ---- 变形（模式 Y）----
  形状变形: 'Deform',
  变形: 'Deform',
  '旋转 (°)': 'Rotate (°)',
  宽度: 'Width',
  高度: 'Height',
  剪切: 'Shear',
  '镜像 x': 'Mirror x',
  '镜像 y': 'Mirror y',
  '非解析变换：真的改变频谱结构，不是在系数上做乘法。':
    'A non-analytic transform: it really changes the spectrum, not just multiplies coefficients.',
  '计算中…': 'Computing…',
  '调一个参数再派生': 'Change a parameter to derive',
  '派生为「{label}」': 'Derive as “{label}”',
  '从「{from}」出发，算完存成一份新资产；原来的形状一字不改。':
    'Derives from “{from}” into a new asset; the original shape is left untouched.',
  变形标签: 'transform',

  // ---- 过渡（Morph）----
  形状过渡: 'Morph',
  过渡: 'Morph',
  启用: 'Enable',
  启用过渡: 'Enable morph',
  起点: 'From',
  终点: 'To',
  过渡起点: 'Morph from',
  过渡终点: 'Morph to',
  '过渡 w': 'Blend w',
  '在库里的两份资产之间做连续形变，两端与各自原图逐位相同。':
    'Blend continuously between two saved assets; both ends match their originals exactly.',
  '库里至少要有两份资产才能做过渡——先冻结两个形状。':
    'Morphing needs at least two saved assets — freeze two shapes first.',
  '0 与 1 处逐位等于两端原图；中间态永远是闭合曲线。':
    'At 0 and 1 it equals each original exactly; every intermediate is still a closed curve.',

  // ---- 资产库 ----
  资产库: 'Assets',
  冻结为资产: 'Freeze as asset',
  '试算中——冻结后系数不再变，可以用任意数值反复演绎':
    'Draft — freeze it and the coefficients stop changing, ready to replay with any values',
  '导入 JSON': 'Import JSON',
  '导入资产 JSON': 'Import asset JSON',
  '还没有资产。冻结一个形状就会出现在这里。': 'No assets yet. Freeze a shape and it shows up here.',
  '已冻结：{name} · {id}': 'Frozen: {name} · {id}',

  // ---- 导出 ----
  导出设置: 'Export settings',
  导出格式: 'Export format',
  'PNG 序列（ZIP）': 'PNG sequence (ZIP)',
  格式: 'Format',
  分辨率: 'Resolution',
  比例: 'Aspect',
  帧率: 'Frame rate',
  循环数: 'Loops',
  '首尾留白 (秒)': 'Head/tail hold (s)',
  '留白是静止帧，不进入时间循环——视频首尾同帧，回看时无缝。':
    'Holds are still frames outside the time loop — the video starts and ends on the same frame, so looping is seamless.',
  背景: 'Background',
  纸白: 'Paper',
  透明: 'Transparent',
  画笔: 'Pen',
  圆链全显: 'Show all circles',
  无圆链: 'Circles hidden',
  手动码率: 'Manual bitrate',
  '码率 (Mbps)': 'Bitrate (Mbps)',
  画幅: 'Frame',
  '帧数 / 时长': 'Frames / duration',
  预估体积: 'Estimated size',
  '探测中…': 'Probing…',
  文件名: 'File name',
  秒: 's',
  帧: 'frames',
  '约 {size}': 'about {size}',
  '导出中 {done}/{total}': 'Exporting {done}/{total}',
  '导出失败：{msg}': 'Export failed: {msg}',
  '已导出 {name}（{size}，{frames} 帧）{note}': 'Exported {name} ({size}, {frames} frames){note}',
  'epicycle_<形状>_<W>x<H>_<fps>_<编码>_<日期>.<扩展名>':
    'epicycle_<shape>_<W>x<H>_<fps>_<codec>_<date>.<ext>',

  // ---- 帮助对话框 ----
  快捷键: 'Keyboard shortcuts',
  '焦点在输入框或下拉里时快捷键会让路，不会跟打字打架。':
    'Shortcuts step aside while you are typing in a field or a dropdown.',
  '怎么导出一条单路径 SVG': 'How to export a single-path SVG',
  '本工具只读 <path> 的 d 属性——不解析 <rect> / <circle> / <polygon>，也不读 <image>。所以先把它变成一条路径：':
    'This tool only reads the d attribute of <path> — it does not parse <rect> / <circle> / <polygon>, nor read <image>. So turn your artwork into a path first:',
  隐私: 'Privacy',
  '全部在浏览器本地计算：不上传、不收集、不需要账号。没有后端，也没有第三方统计脚本，页面不会向外发任何请求。':
    'Everything is computed locally in your browser: nothing is uploaded or collected, no account needed. There is no backend and no third-party analytics — the page makes no outbound requests.',
  '你冻结的资产存在浏览器自己的 IndexedDB 里，清掉站点数据就没了——要长期留存请用「导出 JSON」。':
    'Frozen assets live in this browser’s IndexedDB and disappear when you clear site data — use “Export JSON” if you want to keep them.',
  素材与版权: 'Assets & copyright',
  '你上传的素材、生成的公式与导出的文件都归你，本工具不主张任何权利、也不会把它们传到任何地方。请自行确认上传的素材你有权使用。':
    'The artwork you upload, the formulas you generate and the files you export are all yours. This tool claims no rights over them and never sends them anywhere. Please make sure you have the right to use what you upload.',
  本地性能留档: 'Local performance log',
  '为了知道自己慢在哪，本工具会在你自己的浏览器里留最近 50 条匿名耗时（DFT、导出等）。它不会离开这台设备，关掉或清空后立即生效。':
    'To know where it is slow, this tool keeps the last 50 anonymous timings (DFT, export, …) in your own browser. They never leave this device, and turning them off or clearing them takes effect immediately.',
  记录本地性能数字: 'Record local performance numbers',
  清空记录: 'Clear log',
  '还没有记录。': 'Nothing recorded yet.',
  '中位 {v} ms · {n} 条': 'median {v} ms · {n} entries',
  中位: 'median',

  // ---- 快捷键表 ----
  空格: 'Space',
  '播放 / 暂停': 'Play / pause',
  '项数 K（按住 Shift 一次 10 个）': 'Terms K (hold Shift for 10 at a time)',
  跳到导出: 'Jump to export',

  // ---- 导出：core 出的降级说明（固定文案，直接当 key）----
  'MP4（H.264）没有透明通道，已改用 WebM；各浏览器对 WebM 透明的支持也不一致，要确定带透明请用 PNG 序列。':
    'MP4 (H.264) has no alpha channel, so this will be WebM instead. Browser support for transparency in WebM varies — use a PNG sequence if you need it guaranteed.',
  '本浏览器不能编码 H.264，已改用 WebM。': 'This browser cannot encode H.264, so this will be WebM instead.',
  '本浏览器不能导出带透明的视频，已改用 PNG 序列（保留 alpha）。':
    'This browser cannot export video with transparency, so this will be a PNG sequence (alpha preserved).',
  '本浏览器不支持视频导出，已改用 PNG 序列。':
    'This browser does not support video export, so this will be a PNG sequence.',
  '本浏览器不支持 WebM 录制，已改用 PNG 序列。':
    'This browser does not support WebM recording, so this will be a PNG sequence.',

  // ---- 其余 ----
  '{frames} 帧 · {sec} 秒': '{frames} frames · {sec} s',
  '过渡 {a} → {b}': 'Morph {a} → {b}',
  实际参与项: 'Active terms',
  '当前：{name}': 'Current: {name}',

  // ---- L3 数值序列 ----
  数值序列: 'Value sequence',
  清除注入: 'Clear injection',
  数字: 'Numbers',
  文本: 'Text',
  随机种子: 'Random seed',
  种子: 'Seed',
  同种子必得同动画: 'Same seed, same animation',
  序列输入: 'Sequence input',
  '读入序列文件': 'Load sequence file',
  '读入文件（.csv / .txt）': 'Load file (.csv / .txt)',
  注入: 'Inject',
  '没解析出数字。数字用逗号或空格分隔；文本模式则逐字取码。':
    'No numbers parsed. Separate numbers with commas or spaces; text mode takes one code point per character.',
  '已注入 {n} 个数：{k} 项，周期 {T} 秒': 'Injected {n} values: {k} terms, period {T} s',
  '已读入 {name}，点「注入」生效。': 'Loaded {name}; click “Inject” to apply.',
  '幅度与相位都按线性映射铺开，不做取模或哈希——所以输入相近，动画就相近。':
    'Amplitudes and phases are spread with linear maps only — no modulo, no hashing — so similar input gives a similar animation.',

  // ---- 预置形状名（core 出的固定文案，按原文查表）----
  徽标: 'Badge',
  正方形: 'Square',
  心形: 'Heart',
  星形: 'Star',
  音符: 'Note',
  签名: 'Signature',
}

/** 把 `{name}` 换成实参。缺参就原样留着，便于一眼看出漏了哪一个 */
export function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  )
}

export function translate(lang: Lang, source: string, params?: Record<string, string | number>): string {
  const text = lang === 'en' ? (EN[source] ?? source) : source
  return fill(text, params)
}

/**
 * core 的变换标签是中文（`x2·y0.5·剪1.5·90°·镜像x`），结构由 core 定。
 * 英文模式只把那几个词换掉，不另写一份生成逻辑——两处实现迟早走岔。
 *
 * ⚠️ **冻结下来的派生资产名里仍是中文标签**：名字由 core 在冻结那一刻生成并存进资产。
 * 这里只管界面文案。这是「不动 core 契约」的已知代价，写在交付说明里。
 */
export function translateTransformLabel(lang: Lang, label: string): string {
  if (lang === 'zh') return label
  return label.replace(/镜像x/g, 'mirror-x').replace(/镜像y/g, 'mirror-y').replace(/剪/g, 'shear')
}

// ---------------------------------------------------------------- 诊断（按稳定编号映射）

/**
 * 诊断文案的英文表，按技术文档 §10 的**编号**索引——编号是契约的一部分
 * （`Diagnostic.id` 的注释就写着「便于回查」），比按中文原文匹配稳得多。
 *
 * 带数值的那几条（4 / 5 / 9 / 16）文案里本来就有数，core 不单独给出，
 * 所以只能从中文原文里把数抠出来（见 `firstNumber`）。抠不到就退回中文原文，
 * 不会显示成半截句子。
 */
const DIAGNOSTIC_EN: Record<number, { message: string; hint: string }> = {
  1: {
    message: 'The file contains elements that cannot take part in a Fourier transform: {items}',
    hint: 'Convert them to plain paths and export again',
  },
  2: { message: 'The file is large; parsing may time out', hint: 'Compress it with svgo first' },
  3: {
    message: 'No path data found — make sure this is a vector file',
    hint: 'A PNG will not work; you need an SVG containing <path>',
  },
  4: {
    message: 'Too many subpaths ({n}); joining them adds a lot of connecting segments',
    hint: 'Use “Longest subpath only”, or merge the paths in an editor first',
  },
  5: {
    message: 'The line does not close on itself (gap ≈ {n} % of the long side)',
    hint: 'Switch to “mirror rescan”, or close the path by hand',
  },
  6: {
    message: 'This is a horizontal (or vertical) straight line — it cannot form a closed shape',
    hint: 'Use a path with some area',
  },
  7: { message: 'The line is too short to sample a usable length', hint: 'Use a longer path' },
  8: {
    message: 'The path may be a single pixel — there is no energy in the spectrum',
    hint: 'Use a richer line',
  },
  9: {
    message: 'K has reached the maximum number of terms ({n})',
    hint: 'Raise the sample count N to get more terms',
  },
  12: {
    message: 'Not enough local storage to save this asset',
    hint: 'Delete a few old assets and retry',
  },
  13: {
    message: 'This browser does not allow writing to local storage, so assets cannot be saved',
    hint: 'Use “Export JSON” to save, then “Import JSON” to restore',
  },
  14: {
    message: 'This file is not a valid asset file',
    hint: 'Only .json produced by “Export JSON” can be imported',
  },
  15: {
    message: 'The asset version is unsupported, or the content does not match its fingerprint',
    hint: 'Export it again from the browser it came from',
  },
  16: {
    message: '{n} assets in the local library could not be read and were skipped',
    hint: 'Freeze them again, or delete them',
  },
  17: {
    message: 'The deform did not finish, so no derived asset was created',
    hint: 'Try again; if it keeps failing, save the current shape with “Freeze as asset” first',
  },
  18: {
    message: 'The path data cannot be parsed — sampling aborted',
    hint: 'The path d may be truncated or hold an illegal command; validate it with an editor or svgo',
  },
}

function firstNumber(s: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(s)
  return m ? Number(m[0]) : null
}

export interface DiagnosticText {
  severity: Severity
  message: string
  hint: string
}

/** 把 core 出的中文诊断换成当前语言。认不出的编号 / 抠不到数就原样退回中文，绝不拼半截句 */
export function diagnosticText(lang: Lang, d: Diagnostic): DiagnosticText {
  const zh: DiagnosticText = { severity: d.severity, message: d.message, hint: d.hint }
  if (lang === 'zh') return zh
  const en = DIAGNOSTIC_EN[d.id]
  if (!en) return zh

  if (en.message.includes('{n}')) {
    const n = firstNumber(d.message)
    if (n === null) return zh
    return { severity: d.severity, message: fill(en.message, { n }), hint: en.hint }
  }
  if (en.message.includes('{items}')) {
    // 1 号那条带的是元素名清单，core 用「：」引出，直接取后半段
    const at = d.message.indexOf('：')
    if (at < 0) return zh
    return { severity: d.severity, message: fill(en.message, { items: d.message.slice(at + 1) }), hint: en.hint }
  }
  return { severity: d.severity, message: en.message, hint: en.hint }
}
