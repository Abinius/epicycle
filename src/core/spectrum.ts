import type { Coefficient, Scene } from './types.js'

/**
 * 振幅频谱（PRD A9）：把系数按频率 n 排成柱状图模型，UI 层只负责画柱。
 *
 * 坐标信号 z = x + iy 本身是复数，DFT 没有实信号那种 c_{-n} = conj(c_n) 的对称性
 * ——圆的 c_{+1}=1、c_{-1}≈0，心形反过来 c_{-1}=12.5、c_{+1}=0.5。所以这里
 * **不合并** ±n：每根柱就是一个系数 |c_n|，与系数表一一对应。
 *
 * n=0 是常数项 c_0（路径质心），不参与旋转，也不进频谱——它在系数表里单列。
 */

/** 图表窗口最多显示的频率：越宽柱越挤，而能量集中在低频，收窄到 16 反而读得出形状 */
export const SPECTRUM_MAX_BINS = 16

/** 相对噪地板：|c_n| 低于最大振幅的 1e-9 视为 DFT 的舍入余项，按 0 处理 */
const NOISE_RATIO = 1e-9

export interface SpectrumBin {
  /** 有符号频率：正数正向旋转，负数反向旋转 */
  n: number
  /** |c_n| */
  magnitude: number
  /** 该系数对应系数表里的行号；被项数 K 截断时为 null */
  row: number | null
}

export interface Spectrum {
  /** 反向旋转的柱，按 n 升序（最负在左，紧邻中轴的是 |n| 最小） */
  negative: SpectrumBin[]
  /** 正向旋转的柱，按 n 升序 */
  positive: SpectrumBin[]
  /** 窗口覆盖到的最大频率 |n| */
  top: number
  /** 数据里真实的最大频率 |n|；大于 top 即被 SPECTRUM_MAX_BINS 截断 */
  maxAn: number
  /** 非零系数的个数（含窗口之外的） */
  frequencies: number
  /** 窗口内最大 |c_n|，柱高按它归一 */
  peak: number
}

export function spectrumOf(
  coeffs: readonly Coefficient[],
  scene: Scene,
  maxBins: number = SPECTRUM_MAX_BINS,
): Spectrum {
  const mag = new Map<number, number>()
  for (const c of coeffs) {
    if (c.n !== 0) mag.set(c.n, Math.hypot(c.re, c.im))
  }

  let fullPeak = 0
  for (const m of mag.values()) if (m > fullPeak) fullPeak = m
  const floor = fullPeak * NOISE_RATIO

  let maxAn = 0
  let frequencies = 0
  for (const [n, m] of mag) {
    if (m <= floor) continue
    frequencies++
    if (Math.abs(n) > maxAn) maxAn = Math.abs(n)
  }

  const top = Math.min(maxAn, Math.max(1, maxBins))
  if (top <= 0) return { negative: [], positive: [], top: 0, maxAn: 0, frequencies: 0, peak: 0 }

  const rowOf = new Map<number, number>()
  for (const [i, term] of scene.terms.entries()) rowOf.set(term.n, i)

  const negative: SpectrumBin[] = []
  const positive: SpectrumBin[] = []
  let peak = 0
  for (let an = 1; an <= top; an++) {
    for (const n of [-an, an]) {
      const m = mag.get(n) ?? 0
      const bin: SpectrumBin = { n, magnitude: m <= floor ? 0 : m, row: rowOf.get(n) ?? null }
      ;(n < 0 ? negative : positive).push(bin)
      if (bin.magnitude > peak) peak = bin.magnitude
    }
  }
  negative.reverse()

  return { negative, positive, top, maxAn, frequencies, peak }
}
