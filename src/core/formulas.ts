import { TWO_PI } from './complex.js'

export type FormulaId = 'circle' | 'square' | 'heart' | 'star'

/** 内置公式生成器（模块 B 的入口）。每个生成器都是「参数 → 等参数间距点列」，
 * 之后走同一条 DFT → 动画管线，不是另一套代码。 */

export const formulaNames: Record<FormulaId, string> = {
  circle: '圆',
  square: '正方形',
  heart: '心形',
  star: '星形',
}

interface Sampled {
  id: FormulaId
  name: string
  points: Float64Array
  bbox: [number, number, number, number]
}

function make(id: FormulaId, N: number, fn: (t: number) => [number, number]): Sampled {
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
  return { id, name: formulaNames[id], points: out, bbox: [minX, minY, maxX, maxY] }
}

export function circle(N: number): Sampled {
  return make('circle', N, (t) => [Math.cos(t), Math.sin(t)])
}

/** 正方形边界：按边序走四个角，相邻采样点落在边上 */
export function square(N: number, half = 1): Sampled {
  const corners: [number, number][] = [
    [half, half],
    [-half, half],
    [-half, -half],
    [half, -half],
  ]
  return make('square', N, (t) => {
    const s = (t / TWO_PI) * 4
    const i = Math.floor(s) % 4
    const u = s - Math.floor(s)
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]
  })
}

/** 经典心形。注意：这是次数 4 的三角多项式，解析上带限于 |n| ≤ 4，
 * 所以「加大 K」对它没有任何效果——K 的作用要在宽带形状上才体现。 */
export function heart(N: number, a = 1): Sampled {
  return make('heart', N, (t) => {
    const s = Math.sin(t)
    return [a * 16 * s * s * s, a * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]
  })
}

/** 平滑星形：r(θ) = 1 − depth·(1+cos(kθ))/2 */
export function star(N: number, spikes = 5, depth = 0.35): Sampled {
  return make('star', N, (t) => {
    const r = 1 - (depth * (1 + Math.cos(spikes * t))) / 2
    return [r * Math.cos(t), r * Math.sin(t)]
  })
}

export const formulas: Record<FormulaId, (N: number) => Sampled> = { circle, square, heart, star }
