import { describe, expect, it } from 'vitest'
import { TWO_PI } from '../complex.js'
import { dft, isPowerOfTwo, reconstructPoints, sortByAbs } from '../dft.js'
import type { Coefficient } from '../types.js'

const N = 1024
const M = N / 2

/** 等参数间距采样：fn 返回数学坐标系下的 [x, y] */
function sample(fn: (t: number) => [number, number], n = N): Float64Array {
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const [x, y] = fn((TWO_PI * k) / n)
    out[2 * k] = x
    out[2 * k + 1] = y
  }
  return out
}

function at(coeffs: readonly Coefficient[], n: number): Coefficient {
  return coeffs.find((c) => c.n === n) as Coefficient
}

describe('isPowerOfTwo', () => {
  it('只认正的 2 的幂整数', () => {
    for (const n of [1, 2, 4, 8, 1024, 8192]) expect(isPowerOfTwo(n), `n=${n}`).toBe(true)
    for (const n of [0, 3, 5, 6, 1025, -4, 1.5, NaN]) expect(isPowerOfTwo(n), `n=${n}`).toBe(false)
  })
})

describe('dft 输入校验', () => {
  it('N 非 2 的幂即抛错', () => {
    expect(() => dft(new Float64Array(20), 10)).toThrow(/2 的幂/)
  })
  it('交错数组长度不匹配即抛错', () => {
    expect(() => dft(new Float64Array(6), 4)).toThrow(/不匹配/)
  })
})

describe('dft 输出结构', () => {
  it('输出 2M−1 项，n 恰好覆盖 [−(N/2−1), N/2−1] 且无重复', () => {
    const c = dft(sample((t) => [Math.cos(t), Math.sin(t)]), N)
    expect(c.length).toBe(2 * M - 1)
    const ns = c.map((x) => x.n)
    expect(new Set(ns).size).toBe(ns.length)
    expect(Math.min(...ns)).toBe(-M + 1)
    expect(Math.max(...ns)).toBe(M - 1)
  })
})

describe('V-1 单位圆', () => {
  it('只有 n=1 非零，其余 |c_n| < 1e-12', () => {
    const c = dft(sample((t) => [Math.cos(t), Math.sin(t)]), N)
    expect(Math.hypot(at(c, 1).re, at(c, 1).im)).toBeCloseTo(1, 11)
    expect(Math.abs(at(c, 1).im)).toBeLessThan(1e-11)
    for (const n of [-511, -2, -1, 0, 2, 7, 100, 511]) {
      expect(Math.hypot(at(c, n).re, at(c, n).im), `n=${n}`).toBeLessThan(1e-12)
    }
  })
})

describe('全谱重建', () => {
  it('Σ c_n e^{i2πnk/N} 还原采样序列（含负频率对称取法）', () => {
    const z = sample((t) => [Math.cos(t) + 0.3 * Math.cos(7 * t), Math.sin(3 * t)])
    const c = dft(z, N)
    for (const k of [0, 1, 33, 512, 1023]) {
      let re = 0
      let im = 0
      for (const { n, re: cr, im: ci } of c) {
        const ang = (TWO_PI * n * k) / N
        re += cr * Math.cos(ang) - ci * Math.sin(ang)
        im += cr * Math.sin(ang) + ci * Math.cos(ang)
      }
      expect(Math.abs(re - z[2 * k]), `k=${k}`).toBeLessThan(1e-12)
      expect(Math.abs(im - z[2 * k + 1]), `k=${k}`).toBeLessThan(1e-12)
    }
  })

  it('实数序列满足 c_{-n} = conj(c_n)', () => {
    const c = dft(sample((t) => [Math.cos(t) + 0.3 * Math.cos(7 * t), 0]), N)
    for (const n of [1, 7, 511]) {
      expect(at(c, -n).re).toBeCloseTo(at(c, n).re, 12)
      expect(at(c, -n).im).toBeCloseTo(-at(c, n).im, 12)
    }
  })
})

describe('V-2 方波', () => {
  /** 理想（连续）谱：c_n = 2/(πin) = −2i/(πn)，n 为奇数；偶次为 0 */
  const ideal = (n: number) => -2 / (Math.PI * n)

  it('由分析谱构造的信号被精确还原：奇次 = −2i/(πn)，偶次 = 0（相对误差 < 1e-9）', () => {
    const z = new Float64Array(2 * N)
    for (let k = 0; k < N; k++) {
      let re = 0
      let im = 0
      for (let n = -M + 1; n < M; n += 2) {
        const ang = (TWO_PI * n * k) / N
        re += (2 * Math.sin(ang)) / (Math.PI * n)
        im += (-2 * Math.cos(ang)) / (Math.PI * n)
      }
      z[2 * k] = re
      z[2 * k + 1] = im
    }
    const c = dft(z, N)
    for (const n of [-511, -49, -3, -1, 1, 3, 49, 511]) {
      expect(Math.abs(at(c, n).re), `n=${n}`).toBeLessThan(1e-12)
      expect(Math.abs(at(c, n).im - ideal(n)) / Math.abs(ideal(n)), `n=${n}`).toBeLessThan(1e-9)
    }
    for (const n of [-510, -2, 0, 2, 100, 510]) {
      expect(Math.hypot(at(c, n).re, at(c, n).im), `n=${n}`).toBeLessThan(1e-12)
    }
  })

  it('直接采样 ±1 方波：奇次系数 = 2/N − (2i/N)cot(πn/N)——PRD 的 1e-9 阈值对采样序列不可达', () => {
    const z = sample((t) => (t < Math.PI ? [1, 0] : [-1, 0]))
    const c = dft(z, N)
    for (const n of [1, 3, 11, 101]) {
      // 闭式解：c_n = 2/N − (2i/N)·cot(πn/N)，实部恒为 2/N（N=1024 时约 0.3 % 峰值）
      const wantIm = (-2 / N) * (Math.cos((Math.PI * n) / N) / Math.sin((Math.PI * n) / N))
      expect(Math.abs(at(c, n).re - 2 / N), `n=${n} 实部`).toBeLessThan(1e-11)
      expect(Math.abs(at(c, n).im - wantIm) / Math.abs(wantIm), `n=${n} 虚部`).toBeLessThan(1e-12)
      // 与「朴素」的 2/(πn) 相比，偏差远大于 1e-9
      expect(Math.abs(at(c, n).im - ideal(n)) / Math.abs(ideal(n)), `n=${n} 与理想谱偏差`).toBeGreaterThan(1e-6)
    }
  })
})

describe('reconstructPoints', () => {
  it('N 非 2 的幂即抛错', () => {
    expect(() => reconstructPoints([], 3)).toThrow(/2 的幂/)
  })

  it('从系数重建的采样点还原原信号（全谱重建的 iDFT 侧）', () => {
    const z = sample((t) => [Math.cos(t) + 0.3 * Math.cos(7 * t), Math.sin(3 * t)])
    const c = dft(z, N)
    const r = reconstructPoints(c, N)
    for (const k of [0, 1, 33, 512, 1023]) {
      expect(Math.abs(r[2 * k] - z[2 * k]), `k=${k} re`).toBeLessThan(1e-12)
      expect(Math.abs(r[2 * k + 1] - z[2 * k + 1]), `k=${k} im`).toBeLessThan(1e-12)
    }
  })

  it('往返：dft(reconstructPoints(c, N), N) 逐项还原 c（模式 Y 重算的地基）', () => {
    const z = sample((t) => [Math.cos(t) + 0.3 * Math.cos(7 * t), Math.sin(3 * t) + 0.1])
    const c = dft(z, N)
    const back = dft(reconstructPoints(c, N), N)
    expect(back.length).toBe(c.length)
    for (let i = 0; i < c.length; i++) {
      expect(back[i].n, `i=${i}`).toBe(c[i].n)
      expect(Math.abs(back[i].re - c[i].re), `i=${i} re`).toBeLessThan(1e-12)
      expect(Math.abs(back[i].im - c[i].im), `i=${i} im`).toBeLessThan(1e-12)
    }
  })

})

describe('sortByAbs', () => {
  it('按模降序，模相等时 |n| 小者优先，且不改动入参', () => {
    const src: Coefficient[] = [
      { n: -3, re: 1, im: 0 },
      { n: 0, re: 2, im: 0 },
      { n: 5, re: 2, im: 0 },
      { n: 1, re: 2, im: 0 },
      { n: -7, re: 0.5, im: 0.5 },
    ]
    expect(sortByAbs(src).map((c) => c.n)).toEqual([0, 1, 5, -3, -7])
    expect(src.map((c) => c.n)).toEqual([-3, 0, 5, 1, -7])
  })
})
