import { describe, expect, it } from 'vitest'
import {
  PATH_PRESETS,
  PRESET_IDS,
  PRESET_N,
  PRESET_NAMES,
  presetCoeffs,
  type PresetId,
} from '../presets.js'
import { sample } from '../sampler.js'

describe('预置清单', () => {
  it('六个预置：顺序即选择器顺序，中文名不重不漏', () => {
    expect(PRESET_IDS).toEqual(['circle', 'square', 'heart', 'star', 'note', 'signature'])
    expect(new Set(PRESET_IDS).size).toBe(PRESET_IDS.length)
    expect(Object.keys(PRESET_NAMES)).toEqual([...PRESET_IDS])
    for (const id of PRESET_IDS) expect(PRESET_NAMES[id], id).not.toHaveLength(0)
  })

  it('每个预置都能出系数：n 不重、全有限、可复现', () => {
    for (const id of PRESET_IDS) {
      const coeffs = presetCoeffs(id)
      // dft 的契约是 2M−1 项，M = N/2，即 N−1 项
      expect(coeffs.length, id).toBe(PRESET_N - 1)
      expect(new Set(coeffs.map((c) => c.n)).size, id).toBe(coeffs.length)
      for (const c of coeffs) {
        expect(Number.isFinite(c.re), id).toBe(true)
        expect(Number.isFinite(c.im), id).toBe(true)
      }
      expect(presetCoeffs(id), id).toEqual(coeffs)
    }
  })

  it('六个预置的系数各不相同', () => {
    const fingerprint = (id: PresetId) => presetCoeffs(id).map((c) => `${c.n}:${c.re.toFixed(9)}`).join(',')
    const all = PRESET_IDS.map(fingerprint)
    expect(new Set(all).size).toBe(PRESET_IDS.length)
  })

  it('N 不是 2 的幂就抛错', () => {
    expect(() => presetCoeffs('circle', 10)).toThrow(/2 的幂/)
    expect(() => presetCoeffs('note', 10)).toThrow(/2 的幂/)
  })
})

/** 闭合折线围成的面积（鞋带公式），用来校验内建路径画的是不是想要的轮廓 */
function areaOf(points: Float64Array): number {
  const n = points.length / 2
  let twice = 0
  for (let k = 0; k < n; k++) {
    const i = 2 * ((k + 1) % n)
    twice += points[2 * k] * points[i + 1] - points[i] * points[2 * k + 1]
  }
  return Math.abs(twice / 2)
}

describe('内建路径预置', () => {
  it('音符是天然闭合的轮廓：面积 = 符头椭圆 + 符干矩形', () => {
    const preset = PATH_PRESETS.note
    const result = sample(preset.d, { N: PRESET_N, close_mode: preset.close_mode })
    expect(result.closed).toBe(true)
    expect(result.gap).toBeLessThan(1e-6)
    // 椭圆 π·rx·ry + 符干 3.6 × 80；两者只在切点相接，重叠面积为 0
    // 采样是弦逼近，面积略小于真值，所以给 1% 的余量
    const expected = Math.PI * 16 * 11 + 3.6 * 80
    const area = areaOf(result.points)
    expect(area / expected).toBeGreaterThan(0.99)
    expect(area / expected).toBeLessThan(1.01)
  })

  it('签名是开放笔迹：直线闭合会连出一条横线，所以必须镜像回扫', () => {
    const { d } = PATH_PRESETS.signature
    expect(d.endsWith('Z')).toBe(false)
    const join = sample(d, { N: PRESET_N, close_mode: 'join' })
    expect(join.closed).toBe(false)
    expect(join.gap).toBeGreaterThan(0.15)
    expect(sample(d, { N: PRESET_N, close_mode: 'mirror' }).closed).toBe(true)
  })
})
