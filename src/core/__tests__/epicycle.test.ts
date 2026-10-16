import { describe, expect, it } from 'vitest'
import { TWO_PI, wrap01 } from '../complex.js'
import { createAsset } from '../asset.js'
import { dft } from '../dft.js'
import { buildScene, penAt } from '../epicycle.js'
import { heart } from '../formulas.js'
import { defaultTheta, type Coefficient, type Theta } from '../types.js'

const N = 1024
const theta = (o: Partial<Theta> = {}): Theta => ({ ...defaultTheta, ...o })

/** 独立的参考实现：与 formulas.heart 同源公式但故意不 import，作为重建误差的对照 */
function heartAt(angle: number): [number, number] {
  const s = Math.sin(angle)
  return [16 * s * s * s, 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)]
}

describe('V-3 心形重建', () => {
  it('N=1024 / K=200，RMS 误差 < 0.5 % 峰值半径', () => {
    const pts = heart(N).points
    const scene = buildScene(dft(pts, N), theta({ K: 200 }))
    // 经典心形是次数 4 的三角多项式（16sin³t + 13cos t − 5cos 2t − 2cos 3t − cos 4t），
    // 解析上带限于 |n| ≤ 4：K=200 远超其真实支撑，因此误差在机器精度量级
    expect(scene.terms.length).toBeLessThan(200)

    let peak = 0
    for (let i = 0; i < pts.length; i += 2) {
      peak = Math.max(peak, Math.hypot(pts[i] - scene.center.re, pts[i + 1] - scene.center.im))
    }

    const samples = 4096
    let sumSq = 0
    for (let i = 0; i < samples; i++) {
      const t = i / samples
      const got = penAt(scene, t)
      const [x, y] = heartAt(TWO_PI * t)
      sumSq += (got.re - x) ** 2 + (got.im - y) ** 2
    }
    const rel = Math.sqrt(sumSq / samples) / peak
    expect(rel).toBeLessThan(0.005)
    expect(rel).toBeLessThan(1e-9)
  })
})

describe('V-4 负频率旋转方向', () => {
  const sign = (n: number): number => {
    const s = buildScene([{ n, re: 0, im: 1 }], theta({ K: 4 }))
    const dt = 0.001
    const t = 0.07
    const p0 = penAt(s, t - dt)
    const p1 = penAt(s, t)
    const p2 = penAt(s, t + dt)
    return (p1.re - p0.re) * (p2.im - p1.im) - (p1.im - p0.im) * (p2.re - p1.re)
  }

  it('n > 0 逆时针、n < 0 顺时针（帧间叉积符号相反）', () => {
    expect(sign(3)).toBeGreaterThan(0)
    expect(sign(-3)).toBeLessThan(0)
    expect(Math.abs(sign(3))).toBeCloseTo(Math.abs(sign(-3)), 6)
  })
})

describe('V-5 线性相位斜坡 = 时间平移', () => {
  it('slope·n 只把起点平移 slope/2π，形状与幅度谱不变', () => {
    const coeffs = dft(heart(N).points, N)
    const beta = 0.7
    const a = buildScene(coeffs, theta({ K: N }))
    const b = buildScene(coeffs, theta({ K: N, slope: beta }))
    expect(b.terms.map((t) => t.n)).toEqual(a.terms.map((t) => t.n))
    expect(b.center).toEqual(a.center)

    for (let i = 0; i < a.terms.length; i++) {
      expect(b.terms[i].radius).toBe(a.terms[i].radius)
      expect(b.terms[i].phase - a.terms[i].phase).toBeCloseTo(beta * a.terms[i].n, 12)
    }

    for (const t of [0, 0.031, 0.123, 0.499, 0.777, 0.999]) {
      const want = penAt(a, t + beta / TWO_PI)
      const got = penAt(b, t)
      expect(Math.abs(want.re - got.re), `t=${t}`).toBeLessThan(1e-10)
      expect(Math.abs(want.im - got.im), `t=${t}`).toBeLessThan(1e-10)
    }
  })
})

describe('penAt', () => {
  it('与逐项求和公式一致：z(t) = c_0 + Σ |c_n| e^{i(2πnt + φ_n)}', () => {
    const s = buildScene(
      [
        { n: -7, re: 0.3, im: 0.4 },
        { n: 4, re: -0.2, im: 0.1 },
      ],
      theta({ K: 9, phaseShift: 0.1, slope: 0.05 }),
    )
    const t = 0.314
    let x = s.center.re
    let y = s.center.im
    for (const term of s.terms) {
      const ang = TWO_PI * term.n * t + term.phase
      x += term.radius * Math.cos(ang)
      y += term.radius * Math.sin(ang)
    }
    expect(penAt(s, t)).toEqual({ re: x, im: y })
  })

  it('t 可越界：内部取模，周期严格为 1', () => {
    const s = buildScene([
      { n: 0, re: 0, im: 0 },
      { n: 5, re: 1, im: 0 },
    ], theta({ K: 5 }))
    for (const t of [0.1, -0.2, 2.9, 5]) expect(penAt(s, t)).toEqual(penAt(s, wrap01(t)))
  })

  it('全谱场景在采样点还原原信号', () => {
    const z = heart(N).points
    const scene = buildScene(dft(z, N), theta({ K: N }))
    for (const k of [0, 1, 512, 1023]) {
      const p = penAt(scene, k / N)
      expect(Math.abs(p.re - z[2 * k]), `k=${k}`).toBeLessThan(1e-9)
      expect(Math.abs(p.im - z[2 * k + 1]), `k=${k}`).toBeLessThan(1e-9)
    }
  })
})

describe('buildScene 算子', () => {
  const coeffs: Coefficient[] = [
    { n: 0, re: 1, im: 0.5 },
    { n: 3, re: 2, im: 0 },
    { n: -3, re: 0, im: 2 },
    { n: 11, re: 0.5, im: 0 },
  ]
  const asset = createAsset({
    name: '测试',
    createdAt: '2026-10-14T00:00:00.000Z',
    source: { type: 'formula' },
    sampling: { N, closed: true, close_mode: 'join', subdivide_eps: 0.001 },
    bounds: { center: [0, 0], radius: 1, view_scale: 0.8, orig_bbox: [-1, -1, 1, 1] },
    coeffs,
    dftMs: 1,
  })

  it('既可接收系数数组也可接收完整资产（两者产物一致）', () => {
    expect(buildScene(asset, theta()).terms).toEqual(buildScene(coeffs, theta()).terms)
  })

  it('n=0 作为原点，其余项按模降序；M 为输入系数总数', () => {
    const s = buildScene(coeffs, theta({ scale: 2 }))
    expect(s.center).toEqual({ re: 1, im: 0.5 })
    expect(s.terms.map((t) => t.n)).toEqual([3, -3, 11])
    expect(s.M).toBe(4)
    expect(s.K).toBe(3)
  })

  it('viewScale = 0.8 / Σ|c_n|；weight 以同一总和为分母', () => {
    const s = buildScene(coeffs, theta())
    expect(s.viewScale).toBeCloseTo(0.8 / 4.5, 12)
    expect(s.terms.reduce((acc, t) => acc + t.weight, 0)).toBeCloseTo(1, 12)
  })

  it('scale 整体缩放 viewScale，不改半径与质心', () => {
    const base = buildScene(coeffs, theta())
    const zoomed = buildScene(coeffs, theta({ scale: 2.5 }))
    expect(zoomed.viewScale).toBeCloseTo(base.viewScale * 2.5, 12)
    expect(zoomed.center).toEqual(base.center)
    expect(zoomed.terms.map((t) => t.radius)).toEqual(base.terms.map((t) => t.radius))
  })

  it('K 截断：K≤0 保底 1 项，K 超上限取全部', () => {
    expect(buildScene(coeffs, theta({ K: 0 })).terms.length).toBe(1)
    expect(buildScene(coeffs, theta({ K: 0.4 })).terms.length).toBe(1)
    expect(buildScene(coeffs, theta({ K: 99 })).terms.length).toBe(3)
  })

  it('K 截断后 weight 之和小于 1（分母含被截断的项）', () => {
    const s = buildScene(coeffs, theta({ K: 2 }))
    expect(s.K).toBe(2)
    expect(s.terms.reduce((acc, t) => acc + t.weight, 0)).toBeLessThan(1)
  })

  it('频段过滤作用在 |n| 上', () => {
    expect(buildScene(coeffs, theta({ band: { lo: 2, hi: 3 } })).terms.map((t) => t.n)).toEqual([3, -3])
  })

  it('perN 可单独缩放幅度、偏移相位、隐藏项', () => {
    const s = buildScene(coeffs, theta({ perN: { '3': { s: 0.5 }, '-3': { dphi: 0.25 }, '11': { off: true } } }))
    // n=3 幅度折半后小于 n=-3，排序随之改变
    expect(s.terms.map((t) => t.n)).toEqual([-3, 3])
    expect(s.terms[0].phase).toBeCloseTo(Math.PI / 2 + 0.25, 12)
    expect(s.terms[1].radius).toBeCloseTo(1, 12)
  })

  it('等权化把所有半径归一到 1，scale 整体放大 viewScale', () => {
    const eq = buildScene(coeffs, theta({ equalize: true, scale: 3 }))
    expect(eq.terms.every((t) => t.radius === 1)).toBe(true)
    // 3 项参与、sum=3；viewScale = 0.8·scale/sum = 0.8·3/3 = 0.8
    expect(eq.viewScale).toBeCloseTo(0.8, 12)
  })

  it('全局相位偏移作用于所有项', () => {
    expect(buildScene(coeffs, theta({ phaseShift: 0.5 })).terms[0].phase).toBeCloseTo(0.5, 12)
  })

  it('空场景（全部项被过滤）不产生 NaN', () => {
    const s = buildScene([{ n: 1, re: 0, im: 0 }], theta({ K: 10 }))
    expect(s.terms.length).toBe(0)
    expect(penAt(s, 0.5)).toEqual({ re: 0, im: 0 })
    expect(Number.isFinite(s.viewScale)).toBe(true)
  })
})

describe('Gibbs 过冲（技术文档 §2.5）', () => {
  it('方波截断级数的过冲 ≈ 9 % 台阶（Wilbraham 极限）', () => {
    // 直接由分析谱构造部分和：仅保留奇次 |n| ≤ 101；c_n = −2i/(πn) 使方波落在实部
    const coeffs: Coefficient[] = []
    for (let n = -101; n <= 101; n += 2) coeffs.push({ n, re: 0, im: -2 / (Math.PI * n) })
    const s = buildScene(coeffs, theta({ K: 200 }))
    let peak = 0
    for (let i = 0; i < 200000; i++) {
      const t = i / 200000
      if (t < 0.5) peak = Math.max(peak, penAt(s, t).re)
    }
    // 绝对峰值 → (2/π)·Si(π) = 1.17898；「过冲 9 %」是相对台阶（幅值差 2）而言
    expect(peak).toBeGreaterThan(1.17)
    expect(peak).toBeLessThan(1.19)
    expect((peak - 1) / 2).toBeGreaterThan(0.08)
    expect((peak - 1) / 2).toBeLessThan(0.1)
  })
})
