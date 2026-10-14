import { describe, expect, it } from 'vitest'
import { buildScene } from '../epicycle.js'
import { presetCoeffs } from '../presets.js'
import { SPECTRUM_MAX_BINS, spectrumOf } from '../spectrum.js'
import { defaultTheta, type Coefficient, type Scene } from '../types.js'

/** 手工构造的系数：故意让 ±n 幅度不对称，防止有人把它们当共轭对合并 */
const COEFFS: Coefficient[] = [
  { n: 0, re: 100, im: 40 },
  { n: 1, re: 0, im: 0.5 },
  { n: -1, re: 0, im: 12.5 },
  { n: 2, re: 0, im: 2.5 },
  { n: -2, re: 0, im: 2.5 },
  { n: 3, re: 0, im: 1 },
  { n: -3, re: 0, im: 3 },
]

function sceneOf(coeffs: readonly Coefficient[], K = 64): Scene {
  return buildScene(coeffs, { ...defaultTheta, K })
}

describe('spectrumOf 基本结构', () => {
  const scene = sceneOf(COEFFS)
  const s = spectrumOf(COEFFS, scene)

  it('每个有符号频率一根柱，±n 不合并；顺序是左半轴升序、右半轴升序', () => {
    expect(s.negative).toEqual([
      { n: -3, magnitude: 3, row: 1 },
      { n: -2, magnitude: 2.5, row: 3 },
      { n: -1, magnitude: 12.5, row: 0 },
    ])
    expect(s.positive).toEqual([
      { n: 1, magnitude: 0.5, row: 5 },
      { n: 2, magnitude: 2.5, row: 2 },
      { n: 3, magnitude: 1, row: 4 },
    ])
  })

  it('窗口、频率总数与峰值都按数据来', () => {
    expect(s.top).toBe(3)
    expect(s.maxAn).toBe(3)
    expect(s.frequencies).toBe(6)
    expect(s.peak).toBe(12.5)
  })

  it('常数项 c_0 不进频谱，也不抬高峰值', () => {
    for (const bin of [...s.negative, ...s.positive]) expect(bin.n, `n=${bin.n}`).not.toBe(0)
    expect(s.peak).toBeCloseTo(12.5, 10)
    expect(Math.hypot(100, 40)).toBeGreaterThan(s.peak)
  })
})

describe('行号与项数 K', () => {
  it('row 指向的项确实是这个频率，且在参与项集合内', () => {
    const K = 4
    const scene = sceneOf(COEFFS, K)
    const s = spectrumOf(COEFFS, scene)
    for (const bin of [...s.negative, ...s.positive]) {
      if (bin.row === null) continue
      expect(bin.row, `n=${bin.n}`).toBeLessThan(K)
      expect(scene.terms[bin.row].n, `n=${bin.n}`).toBe(bin.n)
    }
  })

  it('K 变小只把行号置空，幅度、窗口与峰值都不动', () => {
    const full = spectrumOf(COEFFS, sceneOf(COEFFS))
    const cut = spectrumOf(COEFFS, sceneOf(COEFFS, 2))
    expect(cut.top).toBe(full.top)
    expect(cut.maxAn).toBe(full.maxAn)
    expect(cut.frequencies).toBe(full.frequencies)
    expect(cut.peak).toBe(full.peak)
    expect([...cut.negative, ...cut.positive].map((b) => b.magnitude)).toEqual(
      [...full.negative, ...full.positive].map((b) => b.magnitude),
    )
    // K=2 时只有 |c_{-1}| 与 |c_{-3}| 参与，其余频率都没有行号
    expect(cut.negative).toEqual([
      { n: -3, magnitude: 3, row: 1 },
      { n: -2, magnitude: 2.5, row: null },
      { n: -1, magnitude: 12.5, row: 0 },
    ])
    expect(cut.positive.every((b) => b.row === null)).toBe(true)
  })

  it('两个半轴的行号互不重复：一根柱只对应系数表里的一项', () => {
    const s = spectrumOf(COEFFS, sceneOf(COEFFS))
    const rows = [...s.negative, ...s.positive].filter((b) => b.row !== null).map((b) => b.row)
    expect(rows.length).toBe(new Set(rows).size)
  })
})

describe('噪地板与空数据', () => {
  it('小于最大振幅 1e-9 的系数按 0 处理，仍占着自己的频率槽', () => {
    const coeffs: Coefficient[] = [
      { n: 0, re: 0, im: 0 },
      { n: 1, re: 1, im: 0 },
      { n: -1, re: 0, im: 1e-13 },
    ]
    const s = spectrumOf(coeffs, sceneOf(coeffs))
    expect(s).toEqual({
      negative: [{ n: -1, magnitude: 0, row: null }],
      positive: [{ n: 1, magnitude: 1, row: 0 }],
      top: 1,
      maxAn: 1,
      frequencies: 1,
      peak: 1,
    })
  })

  it('只有常数项或完全没有系数时给出空频谱', () => {
    for (const coeffs of [[], [{ n: 0, re: 5, im: 5 }]]) {
      expect(spectrumOf(coeffs, sceneOf(coeffs))).toEqual({
        negative: [],
        positive: [],
        top: 0,
        maxAn: 0,
        frequencies: 0,
        peak: 0,
      })
    }
  })
})

describe('窗口上限', () => {
  it('窗口可收窄，超出的频率只计入 maxAn 与 frequencies', () => {
    const coeffs: Coefficient[] = [
      { n: 0, re: 0, im: 0 },
      { n: 1, re: 1, im: 0 },
      { n: -1, re: 1, im: 0 },
      { n: 10, re: 2, im: 0 },
      { n: -10, re: 2, im: 0 },
    ]
    const s = spectrumOf(coeffs, sceneOf(coeffs), 2)
    expect(s.top).toBe(2)
    expect(s.maxAn).toBe(10)
    expect(s.frequencies).toBe(4)
    // 峰值只看窗口内：|n|=10 的 2 在窗外观测不到，窗口里的最大值是 |n|=1 的 1
    expect(s.peak).toBe(1)
  })

  it('宽带形状按 SPECTRUM_MAX_BINS 截断，带限形状窗口紧贴真实最高频率', () => {
    for (const [id, top, frequencies] of [
      ['circle', 1, 1],
      ['heart', 4, 8],
      ['signature', SPECTRUM_MAX_BINS, 1022],
    ] as const) {
      const coeffs = presetCoeffs(id)
      const s = spectrumOf(coeffs, sceneOf(coeffs))
      expect(s.top, id).toBe(top)
      expect(s.frequencies, id).toBe(frequencies)
      expect(s.maxAn, id).toBeGreaterThanOrEqual(top)
    }
  })
})
