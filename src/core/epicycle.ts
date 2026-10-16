import type { Coefficient, FourierAsset, Four, Scene, Term, Theta } from './types.js'
import { VIEW_BUDGET } from './types.js'
import { TWO_PI, wrap01 } from './complex.js'

/**
 * 把 (冻结系数, 参数向量 θ) 编译成渲染场景 —— C2 模式 X 的实时通路，纯函数。
 *
 * 数学依据：任意复数序列都是某个周期路径的傅里叶系数，所以对系数做任意编辑
 * 都不会破坏连续闭合，只是不再等于原图。因此这里不需要"参数合法性校验"，
 * 只需要正确地把 θ 翻译成 c_n 的变换。
 *
 * n=0 项（路径质心）是常数，没有相位概念，单独作为场景原点返回。
 *
 * θ.scale 是「整体缩放」：乘进 viewScale，让整条曲线连同圆链一起放大/缩小
 * （渲染器以质心居中，所以是关于质心的缩放）。等权化模式把每项半径归一到
 * 固定基数 1，大小同样由 scale 经 viewScale 统一控制——过去把 scale 同时塞进
 * 等权化半径会被 viewScale = 0.8/Σradius 归一化抵消，滑块等于空操作。
 */
/** readonly 数组不匹配 `Array.isArray` 的 `any[]` 守卫，故需显式类型守卫才能收窄 union */
function isCoefficients(v: FourierAsset | readonly Coefficient[]): v is readonly Coefficient[] {
  return Array.isArray(v)
}

export function buildScene(source: FourierAsset | readonly Coefficient[], theta: Theta): Scene {
  const coeffs = isCoefficients(source) ? source : source.coeffs
  const terms: Term[] = []
  let center: Four = { re: 0, im: 0 }
  let sum = 0

  for (const c of coeffs) {
    if (c.n === 0) {
      center = { re: c.re, im: c.im }
      continue
    }
    const an = Math.abs(c.n)
    if (theta.band && !(an >= theta.band.lo && an <= theta.band.hi)) continue
    const p = theta.perN[String(c.n)]
    if (p?.off) continue

    const r0 = Math.hypot(c.re, c.im)
    if (r0 < 1e-12) continue
    const radius = theta.equalize ? 1 : r0 * (p?.s ?? 1)
    if (radius < 1e-12) continue

    const phase = Math.atan2(c.im, c.re) + theta.phaseShift + theta.slope * c.n + (p?.dphi ?? 0)
    terms.push({ n: c.n, radius, phase, weight: 0 })
    sum += radius
  }

  terms.sort((a, b) => (b.radius - a.radius) || (Math.abs(a.n) - Math.abs(b.n)))
  const K = Math.min(Math.max(1, Math.floor(theta.K)), terms.length)
  const active = terms.slice(0, K)
  for (const t of active) t.weight = sum > 0 ? t.radius / sum : 0

  return { center, terms: active, viewScale: (VIEW_BUDGET * theta.scale) / Math.max(sum, 1e-9), K, M: coeffs.length }
}

/**
 * 笔尖位置：pos(t) = c_0 + Σ |c_n| · e^{i(2π n t + φ_n)}。t 可越界，内部取模。
 * upto 截断到前 upto 项，用于「项检查」模式（只跟到被点选的那一项）。
 */
export function penAt(scene: Scene, t: number, upto = scene.terms.length): Four {
  const tt = wrap01(t)
  const n = Math.min(Math.max(0, upto), scene.terms.length)
  let x = scene.center.re
  let y = scene.center.im
  for (let i = 0; i < n; i++) {
    const term = scene.terms[i]
    const ang = TWO_PI * term.n * tt + term.phase
    x += term.radius * Math.cos(ang)
    y += term.radius * Math.sin(ang)
  }
  return { re: x, im: y }
}
