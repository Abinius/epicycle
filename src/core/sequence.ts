import { sortByAbs } from './dft.js'
import type { Coefficient, PerNParam, Theta } from './types.js'

/**
 * L3 数值序列注入（PRD §4.2、技术文档 §2.6）。
 *
 * 一句话：**把任意一串数字变成一条曲线**。映射全部是「线性 + 固定增益」，
 * 不用取模、不用哈希——于是「输入相近 → 动画相近」，而且整条规则能写进帮助文档、
 * 能逐条断言，不是一串魔数。
 *
 * 结果复用 L2 的 perN（幅度倍率 / 相位偏移），所以模式 X 那条「永不触发 DFT」的性质
 * 原样保住了：序列注入完，画面仍是同一组系数上的实时重演。
 */

/** 归一化用的 ε，防止常量序列除零 */
const EPS = 1e-12

/** 幅度槽的下限与增益：s ← 0.2 + 1.6·u，落在 [0.2, 1.8]，永远不会是 0（全塌成一点） */
const AMP_BASE = 0.2
const AMP_GAIN = 1.6

/**
 * mulberry32：32 位种子 → 确定性伪随机。
 * 同种子必得同一串数，于是「随机」这个入口也是可复现、可分享的。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SequenceSource = 'manual' | 'text' | 'seed'

export interface SequenceInput {
  source: SequenceSource
  /** manual/text 用：数字列表或原文 */
  raw?: string
  /** seed 用 */
  seed?: number
  /** 要生成多少个（seed 模式） */
  count?: number
}

/** 文本 → 数值：逐个 UTF-16 code。中英混排都是同一个规则，不用管编码 */
export function textToValues(text: string): number[] {
  return Array.from(text).map((ch) => ch.charCodeAt(0))
}

/** 原始输入 → 一串实数。解析不出数字就当空串（上层会给出提示，不猜） */
export function toValues(input: SequenceInput): number[] {
  if (input.source === 'seed') {
    const rnd = mulberry32(input.seed ?? 1)
    return Array.from({ length: Math.max(1, input.count ?? 32) }, () => rnd())
  }
  const raw = input.raw ?? ''
  if (input.source === 'text') return textToValues(raw)
  return raw
    .split(/[\s,，、;；]+/)
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

/** 线性归一化到 [0,1]。常量序列返回全 0（兜底交给 sequenceSlots） */
export function normalize(values: readonly number[]): number[] {
  if (values.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min + EPS
  return values.map((v) => (v - min) / span)
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/**
 * 相位序列 v：取归一化序列的**相邻差**，首尾相接（j 与 j+1 循环），再归一化一次。
 *
 * 为什么不拿 u 自己当 v（§2.6 允许两种取法）：那样幅度与相位会完全同步，
 * 起伏大的项一律相位也大，出来的动画比用差值单调得多。用差值，输入里「变化快」的位置
 * 会转得快，形状更像在动而不是在缩放。
 */
export function phaseSeries(u: readonly number[]): number[] {
  const m = u.length
  if (m === 0) return []
  if (m === 1) return [0]
  const diff: number[] = []
  for (let j = 0; j < m; j++) diff.push(Math.abs(u[(j + 1) % m] - u[j]))
  return normalize(diff)
}

export interface SequenceSlots {
  /** 幅度倍率，下标是**项的名次**（按 |c| 降序），长度 = K */
  amp: number[]
  /** 相位偏移（弧度），同上 */
  phase: number[]
  /** 由序列推出来的项数 */
  K: number
  /** 由序列推出来的周期（秒） */
  T: number
}

/**
 * 数值序列 → 幅度槽与相位槽（§2.6 的第 1–5 步）。
 *
 * `M` 是可用项数的上限（= 非零系数个数）。K 与 T 都由序列本身决定：
 * 平均归一化值越大 → 项越多、周期越长；这是「输入决定动画」的字面落实。
 */
export function sequenceSlots(values: readonly number[], M: number): SequenceSlots {
  const m = values.length
  if (m === 0 || M <= 0) return { amp: [], phase: [], K: 0, T: 1 }

  // 常量序列（或只有一个值）：用种子化的 0.05 幅度扰动，避免整幅塌成一个圆
  const constant = normalize(values).every((x) => x === 0)
  const u = constant ? Array.from({ length: m }, (_, j) => mulberry32(0x9e3779b9 + j)() * 0.05) : normalize(values)
  const v = constant ? u : phaseSeries(u)

  const K = Math.min(M, Math.max(8, Math.round(mean(u) * M * 0.5)))
  const amp: number[] = []
  const phase: number[] = []
  for (let j = 0; j < K; j++) {
    amp.push(AMP_BASE + AMP_GAIN * u[j % m])
    phase.push(2 * Math.PI * v[j % m])
  }
  return { amp, phase, K, T: 0.5 + 4 * mean(v) }
}

/**
 * 把序列铺到具体的频率上：名次 j 对应「按 |c| 降序排第 j」的那一项的 n。
 *
 * 用**原始系数**定名次而不是 θ 之后的场景——否则 θ.perN 依赖场景、场景又依赖 θ.perN，
 * 转成一个闭环，拖一下滑块名次就会跳。
 */
export function sequencePerN(coeffs: readonly Coefficient[], slots: SequenceSlots): Theta['perN'] {
  const ranked = sortByAbs(coeffs).filter((c) => c.n !== 0)
  const perN: Theta['perN'] = {}
  for (let j = 0; j < slots.amp.length && j < ranked.length; j++) {
    const n = ranked[j].n
    const p: PerNParam = { s: round(slots.amp[j]), dphi: round(slots.phase[j]) }
    perN[String(n)] = p
  }
  return perN
}

/** 存进 θ 之前收一下位数：免得 UI 上出现 0.30000000000000004 这种数 */
function round(x: number): number {
  return Number(x.toFixed(6))
}
