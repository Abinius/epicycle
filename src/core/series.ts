import { TWO_PI } from './complex.js'
import type { Four, Scene } from './types.js'

/**
 * 公式面板（PRD A8）与系数表（A7）的唯一数据源。
 * 代入式、系数表、以及 C2 的系数级编辑都从这里取数，UI 层不许再从 Scene 自己算一遍。
 * 本模块只产出 LaTeX 源码字符串，KaTeX 渲染交给 UI 层。
 */

/** 一个参与合成的项；数组下标即 Scene.terms 的下标，可直接反查渲染高亮 */
export interface SeriesRow {
  n: number
  /** |c_n| */
  radius: number
  /** φ_n，弧度，已折到 [0, 2π) */
  phase: number
  /** φ_n，角度，0–360 */
  phaseDeg: number
  /** c_n 的直角坐标分量，满足 c_n = radius·e^{i·phase} */
  re: number
  im: number
  /** c_n = a + bi 的展示文本 */
  complex: string
  /** 贡献度 = 本项半径 / 参与项半径和 */
  weight: number
}

export interface Series {
  /** c_0：常数项（路径质心），不参与旋转 */
  center: Four
  rows: SeriesRow[]
}

/** Scene → 公式与系数表数据；顺序与 Scene.terms 完全一致（按 |c| 降序） */
export function seriesOf(scene: Scene): Series {
  const rows: SeriesRow[] = scene.terms.map((t) => {
    const phase = wrap2pi(t.phase)
    const re = t.radius * Math.cos(phase)
    const im = t.radius * Math.sin(phase)
    return {
      n: t.n,
      radius: t.radius,
      phase,
      phaseDeg: (phase * 180) / Math.PI,
      re,
      im,
      complex: complexText(re, im),
      weight: t.weight,
    }
  })
  return { center: { re: scene.center.re, im: scene.center.im }, rows }
}

function wrap2pi(a: number): number {
  const d = a % TWO_PI
  return d < 0 ? d + TWO_PI : d
}

/** 去掉末尾的零："1.00" → "1"、"0.500" → "0.5"、"4.00e-4" → "4e-4"；"100" 不动 */
function trimZeros(s: string): string {
  const at = s.indexOf('e')
  const body = at === -1 ? s : s.slice(0, at)
  const exp = at === -1 ? '' : s.slice(at)
  return (body.includes('.') ? body.replace(/0+$/, '').replace(/\.$/, '') : body) + exp
}

/**
 * 3 位有效数字。小于 1e-3 或大于等于 1e6 改走科学计数法（KaTeX 里比 0.0000123 好读）。
 * 减号一律用 ASCII `-`：LaTeX 不认排版减号，而展示层与排版层共用这一份。
 */
export function fmt(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return '0'
  const a = Math.abs(v)
  const body = a < 1e-3 || a >= 1e6 ? trimZeros(a.toExponential(2)) : trimZeros(a.toPrecision(3))
  return v < 0 ? `-${body}` : body
}

/** 角度：1 位小数，范围 0–360 */
export function fmtDeg(deg: number): string {
  return Number.isFinite(deg) ? deg.toFixed(1) : '0.0'
}

/** c_n 的直角坐标写法；分量为 0 时省略，避免出现 "+0i" */
export function complexText(re: number, im: number): string {
  const r = fmt(re)
  const m = fmt(im)
  if (m === '0') return r
  if (r === '0') return `${m}i`
  const neg = m.startsWith('-')
  return `${r}${neg ? '-' : '+'}${neg ? m.slice(1) : m}i`
}

/** 符号式主公式，与数值无关，整站只排版一次 */
export const FORMULA_MASTER = 'z(t)=c_{0}+\\sum_{k=1}^{K}|c_{n_k}|\\,e^{i(2\\pi n_k t+\\varphi_k)}'

/** 代入式的开头：`z(t)=c_0` */
export function centerLatex(center: Four): string {
  return `z(t)=${complexText(center.re, center.im)}`
}

/** 第 k 项的 LaTeX 片段，带前置 `+`，便于把整条公式拆成可点选的高亮片段 */
export function termLatex(row: SeriesRow): string {
  return `+${fmt(row.radius)}\\,e^{i(2\\pi\\cdot ${row.n}\\,t+${fmtDeg(row.phaseDeg)}^{\\circ})}`
}

/** 代入式最多完整展开的项数，超出以省略号结尾 */
export const FORMULA_MAX_TERMS = 8

export const FORMULA_TAIL = '+\\cdots'
