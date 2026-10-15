import { describe, expect, it } from 'vitest'
import { TWO_PI } from '../complex.js'
import { dft, gridFor, isPowerOfTwo, reconstructPoints, sortByAbs } from '../dft.js'
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

  it('升采样精确：在更大的网格上重建再 DFT，原系数逐位保留、新频点为零', () => {
    const c = dft(sample((t) => [Math.cos(t) + 0.3 * Math.cos(7 * t), Math.sin(3 * t)], 64), 64)
    const up = dft(reconstructPoints(c, 512), 512)
    // 混叠公式 C_m = Σ_j c_{m+jN'}：N' 变大时没有两个 n 相差 N'，故原系数原样留在原位
    for (const src of c) {
      const got = up.find((x) => x.n === src.n)!
      expect(Math.abs(got.re - src.re), `n=${src.n} re`).toBeLessThan(1e-12)
      expect(Math.abs(got.im - src.im), `n=${src.n} im`).toBeLessThan(1e-12)
    }
    // 64 网格里不存在的频点（如 n=200）在 512 网格上是零
    expect(Math.hypot(up.find((x) => x.n === 200)!.re, up.find((x) => x.n === 200)!.im)).toBeLessThan(1e-12)
  })

  it('降采样混叠：n 与 n−N′ 折叠到一起，所以 reconstructPoints 只许升不许降', () => {
    // 32 网格上的两个不同频率 n=9 与 n=−7：在 16 网格上只差一个 16，相位完全重合
    const c: Coefficient[] = [
      { n: 9, re: 1, im: 0 },
      { n: -7, re: 0.5, im: 0 },
    ]
    const down = dft(reconstructPoints(c, 16), 16)
    // 两项叠成一项，能量整个落到 −7 上（9 不在 16 网格的输出范围 |n| ≤ 7 里）
    const atMinus7 = down.find((x) => x.n === -7)!
    expect(atMinus7.re).toBeCloseTo(1.5, 11)
    expect(atMinus7.im).toBeCloseTo(0, 11)
    expect(down.some((x) => x.n === 9)).toBe(false)

    // 按 gridFor 升到 32 再重建，两项各就各位——这就是 Morph 只许升采样到公共网格的原因
    const up = dft(reconstructPoints(c, 32), 32)
    expect(up.find((x) => x.n === 9)!.re).toBeCloseTo(1, 11)
    expect(up.find((x) => x.n === -7)!.re).toBeCloseTo(0.5, 11)
  })
})

describe('gridFor', () => {
  it('dft 的输出恰好落在它自己的网格上', () => {
    for (const n of [16, 64, 256]) {
      expect(gridFor(dft(sample((t) => [Math.cos(t), Math.sin(t)], n), n))).toBe(n)
    }
  })

  it('稀疏系数按最大 |n| 取最小 2 的幂网格', () => {
    expect(gridFor([{ n: 0, re: 1, im: 0 }])).toBe(2)
    expect(gridFor([{ n: 1, re: 1, im: 0 }, { n: -1, re: 0, im: 1 }])).toBe(4)
    expect(gridFor([{ n: 11, re: 1, im: 0 }])).toBe(32)
    expect(gridFor([{ n: -127, re: 1, im: 0 }])).toBe(256)
  })

  it('按 gridFor 重建再 DFT 逐位还原（升采样精确的充分条件）', () => {
    const sparse: Coefficient[] = [
      { n: 0, re: 0.5, im: -0.25 },
      { n: 11, re: 1, im: 0.5 },
      { n: -11, re: 0.3, im: -0.2 },
    ]
    const N2 = gridFor(sparse)
    expect(N2).toBe(32)
    const back = dft(reconstructPoints(sparse, N2), N2)
    for (const src of sparse) {
      const got = back.find((x) => x.n === src.n)!
      expect(Math.abs(got.re - src.re), `n=${src.n} re`).toBeLessThan(1e-12)
      expect(Math.abs(got.im - src.im), `n=${src.n} im`).toBeLessThan(1e-12)
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
