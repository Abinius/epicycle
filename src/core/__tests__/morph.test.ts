import { describe, expect, it } from 'vitest'
import { boundsOf } from '../asset.js'
import { TWO_PI } from '../complex.js'
import { dft, reconstructPoints } from '../dft.js'
import { buildScene } from '../epicycle.js'
import { morphBounds, morphCoeffs, planMorph } from '../morph.js'
import { defaultTheta, type Coefficient } from '../types.js'

/** 只含正/负频率谐波的解析信号：z(t) = Σ aₖ·e^{i·k·t}，因此 c_k = aₖ（t 本身就是角度） */
function shape(n: number, harmonics: Array<[number, number]>): Coefficient[] {
  const z = new Float64Array(2 * n)
  for (let j = 0; j < n; j++) {
    const t = (TWO_PI * j) / n
    let x = 0
    let y = 0
    for (const [k, a] of harmonics) {
      x += a * Math.cos(k * t)
      y += a * Math.sin(k * t)
    }
    z[2 * j] = x
    z[2 * j + 1] = y
  }
  return dft(z, n)
}

function at(coeffs: readonly Coefficient[], n: number): Coefficient {
  return coeffs.find((c) => c.n === n)!
}

describe('planMorph', () => {
  it('同网格时公共网格就是它，且不做多余的重建', () => {
    const plan = planMorph(shape(64, [[1, 1]]), shape(64, [[1, 0.5]]))
    expect(plan.N).toBe(64)
    expect(at(plan.a, 1).re).toBeCloseTo(1, 12)
    expect(at(plan.b, 1).re).toBeCloseTo(0.5, 12)
  })

  it('网格不同时升到较大的那个：小的一端精确升采样，系数逐位保留', () => {
    const plan = planMorph(shape(64, [[1, 1], [-2, 0.6]]), shape(128, [[1, 0.5]]))
    expect(plan.N).toBe(128)
    // 升采样精确：n=1 与 n=−2 原样留在原位，没被折到别处
    expect(at(plan.a, 1).re).toBeCloseTo(1, 12)
    expect(at(plan.a, -2).re).toBeCloseTo(0.6, 12)
    // 64 网格上不存在的频点在升采样后是零
    expect(Math.hypot(at(plan.a, 40).re, at(plan.a, 40).im)).toBeLessThan(1e-12)
  })
})

describe('morphCoeffs', () => {
  const A = shape(64, [
    [1, 1],
    [-2, 0.6],
  ])
  const B = shape(64, [
    [1, 0.2],
    [3, 1.5],
  ])
  const plan = planMorph(A, B)

  it('w=0/1 直接返回端点（逐位一致，且是同一份引用）', () => {
    expect(morphCoeffs(plan, 0)).toBe(plan.a)
    expect(morphCoeffs(plan, 1)).toBe(plan.b)
  })

  it('越界的 w 被夹到 [0,1]', () => {
    expect(morphCoeffs(plan, -1)).toBe(plan.a)
    expect(morphCoeffs(plan, 2)).toBe(plan.b)
  })

  it('逐项线性：c(w) = (1−w)·a + w·b（缺项按 0 处理）', () => {
    for (const w of [0.25, 0.5, 0.75]) {
      const got = morphCoeffs(plan, w)
      for (const n of [1, -2, 3]) {
        const a = A.find((c) => c.n === n)
        const b = B.find((c) => c.n === n)
        expect(at(got, n).re, `n=${n} w=${w} re`).toBeCloseTo((1 - w) * (a?.re ?? 0) + w * (b?.re ?? 0), 12)
        expect(at(got, n).im, `n=${n} w=${w} im`).toBeCloseTo((1 - w) * (a?.im ?? 0) + w * (b?.im ?? 0), 12)
      }
    }
  })

  it('中间态永远是一个复数序列——因此永远是一条闭合曲线（§2.4）', () => {
    for (const w of [0, 0.1, 0.33, 0.5, 0.9, 1]) {
      const c = morphCoeffs(plan, w)
      expect(c.length, `w=${w}`).toBeGreaterThan(0)
      // 每个 n 只出现一次：掺和是按 n 对齐的，不会漏项也不会重复
      expect(new Set(c.map((x) => x.n)).size, `w=${w}`).toBe(c.length)
      for (const x of c) expect(Number.isFinite(x.re) && Number.isFinite(x.im), `w=${w} n=${x.n}`).toBe(true)
    }
  })

  it('不修改端点：掺和过一轮后 plan 里的系数原样不动', () => {
    const snapshot = plan.a.map((c) => ({ ...c }))
    morphCoeffs(plan, 0.5)
    expect(plan.a).toEqual(snapshot)
  })

  it('两端系数表不同长时按 n 对齐，缺项当 0（稀疏系数的数组真会这样）', () => {
    const a: Coefficient[] = [
      { n: 0, re: 1, im: 0 },
      { n: 1, re: 1, im: 0 },
    ]
    const b: Coefficient[] = [
      { n: 0, re: 0, im: 0 },
      { n: 1, re: 0, im: 0 },
      { n: -1, re: 0.5, im: 0 },
    ]
    const sparse = planMorph(a, b)
    // 两端 gridFor 都是 4，谁也不用升采样，于是两份系数表的 n 集合并不相同
    expect(sparse.N).toBe(4)
    const got = morphCoeffs(sparse, 0.5)
    expect(at(got, -1).re, 'n=−1 只在 B 里有').toBeCloseTo(0.25, 12)
    expect(at(got, 1).re).toBeCloseTo(0.5, 12)
    expect(at(got, 0).re).toBeCloseTo(0.5, 12)
  })
})

describe('R-6 两端与各自原图一致', () => {
  const A = shape(64, [
    [1, 1],
    [-2, 0.6],
  ])
  // B 在更大的网格上：A 会被升采样，两端一致仍应成立
  const B = shape(128, [
    [1, 0.2],
    [3, 1.5],
  ])

  it('w=0 的场景与资产 A 自己的场景逐项一致', () => {
    const plan = planMorph(A, B)
    const want = buildScene(A, defaultTheta)
    const got = buildScene(morphCoeffs(plan, 0), defaultTheta)
    expect(got.terms.length).toBe(want.terms.length)
    expect(got.viewScale).toBeCloseTo(want.viewScale, 11)
    for (let i = 0; i < want.terms.length; i++) {
      expect(got.terms[i].n, `i=${i}`).toBe(want.terms[i].n)
      expect(got.terms[i].radius, `i=${i}`).toBeCloseTo(want.terms[i].radius, 11)
      expect(got.terms[i].phase, `i=${i}`).toBeCloseTo(want.terms[i].phase, 11)
    }
  })

  it('w=1 的场景与资产 B 自己的场景逐项一致', () => {
    const plan = planMorph(A, B)
    const want = buildScene(B, defaultTheta)
    const got = buildScene(morphCoeffs(plan, 1), defaultTheta)
    expect(got.terms.map((t) => t.n)).toEqual(want.terms.map((t) => t.n))
    for (let i = 0; i < want.terms.length; i++) {
      expect(got.terms[i].radius, `i=${i}`).toBeCloseTo(want.terms[i].radius, 11)
    }
  })
})

describe('morphBounds', () => {
  const plan = planMorph(
    shape(64, [
      [1, 1],
      [-2, 0.6],
    ]),
    shape(64, [
      [1, 0.2],
      [3, 1.5],
    ]),
  )

  it('view_scale 与 buildScene 用同一个式子，是精确值', () => {
    for (const w of [0, 0.5, 1]) {
      const scene = buildScene(morphCoeffs(plan, w), defaultTheta)
      expect(morphBounds(plan, w).view_scale, `w=${w}`).toBeCloseTo(scene.viewScale, 12)
    }
  })

  it('radius 是 sup|z − c₀| 的上界：不小于逐点算出来的最远距离', () => {
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      const c = morphCoeffs(plan, w)
      const b = morphBounds(plan, w)
      const real = boundsOf(c, reconstructPoints(c, plan.N))
      expect(b.radius, `w=${w}`).toBeGreaterThanOrEqual(real.radius - 1e-9)
      expect(b.center[0], `w=${w} center x`).toBeCloseTo(real.center[0], 12)
      expect(b.center[1], `w=${w} center y`).toBeCloseTo(real.center[1], 12)
    }
  })

  it('质心取 n=0 那一项', () => {
    const withDc = dft(
      (() => {
        const z = new Float64Array(128)
        for (let k = 0; k < 64; k++) {
          const t = (TWO_PI * k) / 64
          z[2 * k] = 3 + Math.cos(t)
          z[2 * k + 1] = -2 + Math.sin(t)
        }
        return z
      })(),
      64,
    )
    const p = planMorph(withDc, shape(64, [[1, 1]]))
    expect(morphBounds(p, 0).center[0]).toBeCloseTo(3, 11)
    expect(morphBounds(p, 0).center[1]).toBeCloseTo(-2, 11)
  })
})
