import { TWO_PI } from './complex.js'

export type FormulaId = 'circle' | 'square' | 'heart' | 'star'

/**
 * 内置公式生成器（模块 B 的入口）。每个生成器都是「参数 → 等参数间距点列」，
 * 之后走同一条 DFT → 本轮动画管线，不是另一套代码。
 * 返回交错数组 [x0, y0, ...]，长度为 2N，y 向上。
 */

interface Sampled {
  id: FormulaId
  name: string
  points: Float64Array
  bbox: [number, number, number, number]
}

function make(id: FormulaId, name: string, N: number, fn: (t: number) => [number, number]): Sampled {
  const out = new Float64Array(2 * N)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k < N; k++) {
    const [x, y] = fn((TWO_PI * k) / N)
    out[2 * k] = x
    out[2 * k + 1] = y
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { id, name, points: out, bbox: [minX, minY, maxX, maxY] }
}

export function circle(N: number): Sampled {
  return make('circle', '圆', N, (t) => [Math.cos(t), Math.sin(t)])
}

/** 正方形边界：按边序走四个角，相邻采样点落在边上 */
export function square(N: number, half = 1): Sampled {
  const corners: [number, number][] = [
    [half, half],
    [-half, half],
    [-half, -half],
    [half, -half],
  ]
  return make('square', '正方形', N, (t) => {
    const s = (t / TWO_PI) * 4
    const i = Math.floor(s) % 4
    const u = s - Math.floor(s)
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]
  })
}

export function heart(N: number, a = 1): Sampled {
  return make('heart', '心形', N, (t) => {
    const st = Math.sin(t)
    return [a * 16 * st * st * st, a * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]
  })
}

/** 平滑星形：r(θ) = 1 − depth·(1+cos(kθ))/2 */
export function star(N: number, spikes = 5, depth = 0.35): Sampled {
  return make('star', '星形', N, (t) => {
    const r = 1 - (depth * (1 + Math.cos(spikes * t))) / 2
    return [r * Math.cos(t), r * Math.sin(t)]
  })
}

export const formulas: Record<FormulaId, (N: number) => Sampled> = { circle, square, heart, star }
