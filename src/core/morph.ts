import { dft, gridFor, reconstructPoints } from './dft.js'
import { VIEW_BUDGET, type Coefficient, type FourierAsset } from './types.js'

/**
 * PRD §4.3：两份冻结资产之间的逐项线性过渡 `cₙ(w) = (1−w)·cₙᴬ + w·cₙᴮ`。
 *
 * 为什么是「零额外数学成本」：任意复数序列都是某条周期闭合曲线的傅里叶系数（§2.4），
 * 凸组合仍是复数序列，所以每个中间态天生就是一条闭合曲线——不必插值曲线本身、不必重采样形状，
 * 只把两边的 cₙ 按同一个 w 掺在一起。R-6 的「0→1 连续无跳变」由 cₙ(w) 对 w 连续直接给出。
 *
 * 唯一要处理的是两边的频率网格：升采样到两者的最小公共网格。升采样是精确的（见 dft.ts 的
 * gridFor），降采样会把 n 与 n∓N′ 折叠到一起，所以这里只升不降。
 */

export interface MorphPlan {
  /** 同一个 N 网格上的两组系数 */
  a: Coefficient[]
  b: Coefficient[]
  /** 公共网格 */
  N: number
}

/** 把一组系数搬到 N 网格上。只许升（N ≥ gridFor(coeffs)），降会混叠 */
function onGrid(coeffs: readonly Coefficient[], N: number): Coefficient[] {
  return gridFor(coeffs) === N ? coeffs.slice() : dft(reconstructPoints(coeffs, N), N)
}

/** 预备：把两端搬到公共网格。O(N·M)，只随「换了哪两份资产」重算，不随 w 重算 */
export function planMorph(a: readonly Coefficient[], b: readonly Coefficient[]): MorphPlan {
  const N = Math.max(gridFor(a), gridFor(b))
  return { a: onGrid(a, N), b: onGrid(b, N), N }
}

function clamp01(w: number): number {
  return w < 0 ? 0 : w > 1 ? 1 : w
}

/**
 * 过渡态系数。w=0/1 直接返回端点、不做掺和，所以「两端与各自原图一致」逐位成立——
 * 除非两端网格不同，此时较小的一端已在 planMorph 里精确升采样过，与它原图的差别只剩浮点舍入。
 *
 * w=0/1 返回的是 plan 里那一份（不复制）：省掉每帧一次全量拷贝，调用方不要改它。
 */
export function morphCoeffs(plan: MorphPlan, w: number): Coefficient[] {
  const t = clamp01(w)
  if (t === 0) return plan.a
  if (t === 1) return plan.b
  const byN = new Map<number, Coefficient>()
  for (const c of plan.a) byN.set(c.n, { n: c.n, re: c.re * (1 - t), im: c.im * (1 - t) })
  for (const c of plan.b) {
    const cur = byN.get(c.n)
    if (cur) {
      cur.re += c.re * t
      cur.im += c.im * t
    } else {
      byN.set(c.n, { n: c.n, re: c.re * t, im: c.im * t })
    }
  }
  return [...byN.values()]
}

/**
 * 过渡态的包围盒。`radius` 与 `orig_bbox` 取保守上界 `Σ_{n≠0}|cₙ|`（曲线偏离质心的最大可能距离），
 * 不重建采样点——重建是 O(N·M)，而 w 每动一下都要算这个。
 * `view_scale` 与 buildScene 用同一个式子，所以它是精确值而不是上界。
 */
export function morphBounds(plan: MorphPlan, w: number): FourierAsset['bounds'] {
  let cx = 0
  let cy = 0
  let spread = 0
  for (const c of morphCoeffs(plan, w)) {
    if (c.n === 0) {
      cx = c.re
      cy = c.im
      continue
    }
    // n=0 是质心本身，不计进「偏离质心的幅度和」——boundsOf 与 buildScene 都是这么算的
    spread += Math.hypot(c.re, c.im)
  }
  return {
    center: [cx, cy],
    radius: spread,
    view_scale: VIEW_BUDGET / Math.max(spread, 1e-9),
    orig_bbox: [cx - spread, cy - spread, cx + spread, cy + spread],
  }
}
